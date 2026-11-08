//! Which addresses the listener may bind.
//!
//! Never `0.0.0.0`: binding every interface would put the library on a VPN, a
//! hotspot uplink or a public address the user never meant to share. The
//! listener binds each **private** IPv4 address the machine has (RFC 1918 and
//! link-local), one socket per address, and refuses to start when there is
//! none. IPv6 is left out of v0: Android's NSD and the QR both work with IPv4,
//! and a ULA-only network is rare enough to wait for a real report.

use std::net::{IpAddr, Ipv4Addr};

/// Whether `ip` is an address a LAN listener may bind.
pub fn is_private_lan(ip: Ipv4Addr) -> bool {
    !ip.is_loopback() && (ip.is_private() || ip.is_link_local())
}

/// Every private IPv4 address on an interface that is up, deduplicated, with
/// RFC 1918 addresses before link-local ones (a phone on the same Wi-Fi
/// reaches those first).
///
/// # Errors
///
/// The OS error when the interface list cannot be read.
pub fn private_ipv4_addresses() -> std::io::Result<Vec<Ipv4Addr>> {
    let mut found: Vec<Ipv4Addr> = if_addrs::get_if_addrs()?
        .into_iter()
        .filter_map(|interface| match interface.ip() {
            IpAddr::V4(ip) if is_private_lan(ip) => Some(ip),
            _ => None,
        })
        .collect();
    found.sort_by_key(|ip| (ip.is_link_local(), *ip));
    found.dedup();
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_private_and_link_local_addresses_qualify() {
        assert!(is_private_lan(Ipv4Addr::new(192, 168, 1, 20)));
        assert!(is_private_lan(Ipv4Addr::new(10, 0, 0, 5)));
        assert!(is_private_lan(Ipv4Addr::new(172, 16, 4, 1)));
        assert!(is_private_lan(Ipv4Addr::new(169, 254, 3, 3)));
        assert!(!is_private_lan(Ipv4Addr::LOCALHOST));
        assert!(!is_private_lan(Ipv4Addr::UNSPECIFIED));
        assert!(!is_private_lan(Ipv4Addr::new(8, 8, 8, 8)));
        assert!(!is_private_lan(Ipv4Addr::new(172, 32, 0, 1)));
    }
}
