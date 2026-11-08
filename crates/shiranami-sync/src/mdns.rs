//! `_shiranami._tcp` advertisement, only while the listener runs.
//!
//! In v0 the QR code is the primary path and mDNS is a convenience for v1's
//! reconnect (the phone finds the desktop again after its DHCP lease moves).
//! A failure here is therefore logged and swallowed: a network that blocks
//! multicast must not stop pairing by QR.
//!
//! TXT records: `v` (protocol version) and `id` (desktop id). Nothing secret.

use std::net::Ipv4Addr;

use mdns_sd::{ServiceDaemon, ServiceInfo};

use crate::wire::PROTOCOL_VERSION;

/// The DNS-SD service type.
pub const SERVICE_TYPE: &str = "_shiranami._tcp.local.";

/// A registered advertisement. Dropping it does not unregister; call
/// [`Advertisement::stop`].
pub struct Advertisement {
    daemon: ServiceDaemon,
    fullname: String,
}

impl std::fmt::Debug for Advertisement {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Advertisement")
            .field("fullname", &self.fullname)
            .finish_non_exhaustive()
    }
}

impl Advertisement {
    /// Register `instance` on `ips:port`. `None` (with a warning) on failure.
    pub fn start(instance: &str, desktop_id: &str, ips: &[Ipv4Addr], port: u16) -> Option<Self> {
        let daemon = match ServiceDaemon::new() {
            Ok(daemon) => daemon,
            Err(error) => {
                tracing::warn!(%error, "sync: mDNS daemon did not start; QR pairing still works");
                return None;
            }
        };
        let host = format!("{}.local.", host_label(desktop_id));
        let version = PROTOCOL_VERSION.to_string();
        let properties = [("v", version.as_str()), ("id", desktop_id)];
        let addresses: Vec<std::net::IpAddr> = ips.iter().map(|ip| (*ip).into()).collect();
        let info = match ServiceInfo::new(
            SERVICE_TYPE,
            instance,
            &host,
            addresses.as_slice(),
            port,
            &properties[..],
        ) {
            Ok(info) => info,
            Err(error) => {
                tracing::warn!(%error, "sync: could not describe the mDNS service");
                let _ = daemon.shutdown();
                return None;
            }
        };
        let fullname = info.get_fullname().to_owned();
        if let Err(error) = daemon.register(info) {
            tracing::warn!(%error, "sync: could not register the mDNS service");
            let _ = daemon.shutdown();
            return None;
        }
        tracing::info!(port, "sync: advertising _shiranami._tcp");
        Some(Self { daemon, fullname })
    }

    /// Unregister and stop the daemon. Best effort.
    pub fn stop(self) {
        let _ = self.daemon.unregister(&self.fullname);
        let _ = self.daemon.shutdown();
    }
}

/// A DNS label for the host record, derived from the desktop id rather than
/// the machine name so no user-chosen text has to be escaped.
fn host_label(desktop_id: &str) -> String {
    let id: String = desktop_id
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .take(12)
        .collect();
    format!("shiranami-{id}")
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_host_label_is_a_plain_dns_label() {
        let label = super::host_label("6f1c-22ab_x!");
        assert_eq!(label, "shiranami-6f1c22abx");
    }
}
