//! The pairing window and the `shiranami://pair` link the QR code carries.
//!
//! Pressing "Pair a phone" opens a window for [`PAIRING_TTL`]: a fresh nonce
//! (`t=`) and a fresh 32-byte secret (`k=`), both in the QR and nowhere else.
//! A phone proves it scanned the code by sending an HMAC under `k` over the
//! nonce and its own name; the desktop user then answers Allow or Deny. On
//! Allow the window closes, so one QR pairs exactly one phone, and both sides
//! derive the device's long-lived secret from `k` and the new device id. `k`
//! itself is never stored.
//!
//! Ten bad proofs close the window outright: `k` is 256 bits, so this is not
//! about brute force, it is about a misbehaving client hammering the prompt.

use std::time::{Duration, Instant};

use subtle::ConstantTimeEq as _;

use crate::auth::{b64, random_bytes, unb64};
use crate::status::SyncPairingTicket;
use crate::wire::PROTOCOL_VERSION;

/// How long a pairing window stays open.
pub const PAIRING_TTL: Duration = Duration::from_secs(5 * 60);

/// How long a phone waits for the desktop user's answer.
pub const APPROVAL_TIMEOUT: Duration = Duration::from_secs(120);

/// Bad proofs tolerated before the window closes.
pub const MAX_PAIR_FAILURES: u32 = 10;

/// The deep link scheme and host.
pub const PAIR_LINK_PREFIX: &str = "shiranami://pair?";

/// An open pairing window.
pub(crate) struct PairingWindow {
    pub(crate) nonce: String,
    pub(crate) secret: [u8; 32],
    pub(crate) expires_at: Instant,
    pub(crate) failures: u32,
    /// A phone has proven itself and is waiting for Allow / Deny.
    pub(crate) busy: bool,
    pub(crate) ticket: SyncPairingTicket,
}

impl PairingWindow {
    /// Open a window for a listener reachable at `hosts:port`.
    pub(crate) fn open(
        hosts: &[String],
        port: u16,
        desktop_id: &str,
        desktop_name: &str,
        ttl: Duration,
        now_ms: i64,
    ) -> Self {
        let nonce = b64(&random_bytes::<16>());
        let secret = random_bytes::<32>();
        let deep_link = PairingLink {
            version: PROTOCOL_VERSION,
            hosts: hosts.to_vec(),
            port,
            desktop_id: desktop_id.to_owned(),
            desktop_name: desktop_name.to_owned(),
            nonce: nonce.clone(),
            secret: b64(&secret),
        }
        .to_url();
        let ttl_ms = i64::try_from(ttl.as_millis()).unwrap_or(i64::MAX);
        Self {
            nonce,
            secret,
            expires_at: Instant::now() + ttl,
            failures: 0,
            busy: false,
            ticket: SyncPairingTicket {
                deep_link,
                hosts: hosts.to_vec(),
                port,
                expires_at: now_ms.saturating_add(ttl_ms),
            },
        }
    }

    pub(crate) fn is_expired(&self) -> bool {
        Instant::now() >= self.expires_at
    }

    pub(crate) fn nonce_matches(&self, candidate: &str) -> bool {
        self.nonce.len() == candidate.len()
            && bool::from(self.nonce.as_bytes().ct_eq(candidate.as_bytes()))
    }
}

/// The fields of a `shiranami://pair?...` link.
///
/// | Param | Field |
/// | ----- | ----- |
/// | `v` | protocol version |
/// | `h` | comma-separated host candidates, try in order |
/// | `p` | port |
/// | `id` | desktop id |
/// | `n` | desktop display name |
/// | `t` | one-time pairing nonce |
/// | `k` | 32-byte pairing secret, base64url |
#[derive(Clone, PartialEq, Eq)]
pub struct PairingLink {
    /// `v`.
    pub version: u32,
    /// `h`.
    pub hosts: Vec<String>,
    /// `p`.
    pub port: u16,
    /// `id`.
    pub desktop_id: String,
    /// `n`.
    pub desktop_name: String,
    /// `t`.
    pub nonce: String,
    /// `k`, still encoded.
    pub secret: String,
}

impl std::fmt::Debug for PairingLink {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PairingLink")
            .field("version", &self.version)
            .field("hosts", &self.hosts)
            .field("port", &self.port)
            .field("secret", &"<redacted>")
            .finish_non_exhaustive()
    }
}

impl PairingLink {
    /// Encode as the QR payload.
    pub fn to_url(&self) -> String {
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("v", &self.version.to_string())
            .append_pair("h", &self.hosts.join(","))
            .append_pair("p", &self.port.to_string())
            .append_pair("id", &self.desktop_id)
            .append_pair("n", &self.desktop_name)
            .append_pair("t", &self.nonce)
            .append_pair("k", &self.secret)
            .finish();
        format!("{PAIR_LINK_PREFIX}{query}")
    }

    /// Parse a scanned payload. `None` for anything that is not a complete
    /// pairing link.
    pub fn parse(link: &str) -> Option<Self> {
        let query = link.strip_prefix(PAIR_LINK_PREFIX)?;
        let (mut version, mut hosts, mut port, mut id, mut name, mut nonce, mut secret) =
            (None, None, None, None, None, None, None);
        for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
            let value = value.into_owned();
            match key.as_ref() {
                "v" => version = value.parse().ok(),
                "h" => {
                    hosts = Some(
                        value
                            .split(',')
                            .filter(|host| !host.is_empty())
                            .map(str::to_owned)
                            .collect::<Vec<_>>(),
                    );
                }
                "p" => port = value.parse().ok(),
                "id" => id = Some(value),
                "n" => name = Some(value),
                "t" => nonce = Some(value),
                "k" => secret = Some(value),
                _ => {}
            }
        }
        let secret = secret?;
        unb64(&secret).filter(|bytes| bytes.len() == 32)?;
        Some(Self {
            version: version?,
            hosts: hosts.filter(|hosts| !hosts.is_empty())?,
            port: port?,
            desktop_id: id?,
            desktop_name: name.unwrap_or_default(),
            nonce: nonce?,
            secret,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_link_round_trips_and_escapes_the_name() {
        let link = PairingLink {
            version: 1,
            hosts: vec!["192.168.1.20".into(), "10.0.0.5".into()],
            port: 47321,
            desktop_id: "desk".into(),
            desktop_name: "Kacper's Mac & co".into(),
            nonce: "abcdefghijklmnopqrstuv".into(),
            secret: b64(&[9_u8; 32]),
        };
        let url = link.to_url();
        assert!(url.starts_with("shiranami://pair?v=1&h=192.168.1.20%2C10.0.0.5&p=47321"));
        assert_eq!(PairingLink::parse(&url), Some(link));
    }

    #[test]
    fn an_incomplete_link_is_refused() {
        assert!(PairingLink::parse("shiranami://pair?v=1&p=1").is_none());
        assert!(PairingLink::parse("https://example.com").is_none());
        let short_key = format!(
            "shiranami://pair?v=1&h=1.2.3.4&p=1&id=x&t=abcdefghijklmnop&k={}",
            b64(&[1; 8])
        );
        assert!(PairingLink::parse(&short_key).is_none());
    }

    #[test]
    fn a_window_mints_a_fresh_secret_each_time() {
        let hosts = vec!["127.0.0.1".to_owned()];
        let a = PairingWindow::open(&hosts, 1, "d", "n", PAIRING_TTL, 0);
        let b = PairingWindow::open(&hosts, 1, "d", "n", PAIRING_TTL, 0);
        assert_ne!(a.secret, b.secret);
        assert_ne!(a.nonce, b.nonce);
        assert!(a.nonce_matches(&a.nonce.clone()));
        assert!(!a.nonce_matches(&b.nonce));
        assert_eq!(a.ticket.expires_at, 300_000);
    }
}
