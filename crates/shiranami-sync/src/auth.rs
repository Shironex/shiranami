//! Request signing: the `SNM1` scheme, key derivation and replay protection.
//!
//! v0 runs over plain HTTP on the LAN, so a bearer token would be readable by
//! anyone on the same Wi-Fi and replayable forever. Instead the per-device
//! secret never crosses the wire (it is derived from the QR secret on both
//! sides) and every request carries an HMAC over what it asks for:
//!
//! ```text
//! Authorization: SNM1 dev=<deviceId>,ts=<unix seconds>,n=<nonce>,sig=<base64url>
//!
//! sig = HMAC-SHA256(deviceSecret,
//!         "SNM1\n" + METHOD + "\n" + pathAndQuery + "\n" + ts + "\n" + nonce + "\n"
//!         + lowercase hex SHA-256(body))
//! ```
//!
//! The query string is signed, so a sniffer cannot rewrite a cursor or a
//! limit. A request is refused (404, no body) when the device is unknown, the
//! signature does not verify, `ts` is more than [`MAX_SKEW_SECS`] away from
//! the desktop clock, or the nonce was already used inside the window.
//! What v0 still leaks to a sniffer is content: track names and audio bytes.
//! TLS with a pinned fingerprint is the v1 answer to that.

use std::collections::HashMap;
use std::sync::Mutex;

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, Mac as _};
use sha2_next::{Digest as _, Sha256};

/// The scheme name in the `Authorization` header and the first line of the
/// signed payload.
pub const AUTH_SCHEME: &str = "SNM1";

/// How far a request timestamp may be from the desktop clock, either way.
pub const MAX_SKEW_SECS: i64 = 120;

/// Domain separator for the pairing proof.
pub const PAIR_PROOF_CONTEXT: &str = "shiranami-sync/v1/pair";

/// Domain separator for the device secret derivation.
pub const DEVICE_SECRET_CONTEXT: &str = "shiranami-sync/v1/device-secret";

/// Nonces must be this long at least, in characters.
const MIN_NONCE_LEN: usize = 16;
/// And at most this long.
const MAX_NONCE_LEN: usize = 64;

type HmacSha256 = Hmac<Sha256>;

/// HMAC-SHA256 of `message` under `key`.
pub fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    // HMAC accepts a key of any length, so this cannot fail.
    let mut mac = <HmacSha256 as hmac::KeyInit>::new_from_slice(key)
        .unwrap_or_else(|_| unreachable!("HMAC takes keys of any length"));
    mac.update(message);
    mac.finalize().into_bytes().into()
}

/// Constant-time check of `tag` against HMAC-SHA256(`key`, `message`).
pub fn hmac_verify(key: &[u8], message: &[u8], tag: &[u8]) -> bool {
    let mut mac = <HmacSha256 as hmac::KeyInit>::new_from_slice(key)
        .unwrap_or_else(|_| unreachable!("HMAC takes keys of any length"));
    mac.update(message);
    mac.verify_slice(tag).is_ok()
}

/// Base64url without padding, the encoding of every key and tag on the wire.
pub fn b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Decode [`b64`]. `None` for anything that is not valid base64url.
pub fn unb64(text: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(text).ok()
}

/// Lowercase hex SHA-256.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// The pairing proof a phone sends: base64url HMAC over the pair fields.
pub fn pair_proof(pairing_secret: &[u8], nonce: &str, device_name: &str, platform: &str) -> String {
    let message = format!("{PAIR_PROOF_CONTEXT}\n{nonce}\n{device_name}\n{platform}");
    b64(&hmac_sha256(pairing_secret, message.as_bytes()))
}

/// The long-lived device secret both sides derive after pairing.
pub fn device_secret(pairing_secret: &[u8], device_id: &str) -> [u8; 32] {
    let message = format!("{DEVICE_SECRET_CONTEXT}\n{device_id}");
    hmac_sha256(pairing_secret, message.as_bytes())
}

/// The exact string a request signature covers.
pub fn signing_payload(
    method: &str,
    path_and_query: &str,
    ts: i64,
    nonce: &str,
    body: &[u8],
) -> String {
    format!(
        "{AUTH_SCHEME}\n{}\n{path_and_query}\n{ts}\n{nonce}\n{}",
        method.to_ascii_uppercase(),
        sha256_hex(body)
    )
}

/// Build a complete `Authorization` value. Used by tests and the fake client;
/// the phone implements the same three lines in TypeScript.
pub fn authorization_header(
    device_id: &str,
    secret: &[u8],
    method: &str,
    path_and_query: &str,
    ts: i64,
    nonce: &str,
    body: &[u8],
) -> String {
    let payload = signing_payload(method, path_and_query, ts, nonce, body);
    let sig = b64(&hmac_sha256(secret, payload.as_bytes()));
    format!("{AUTH_SCHEME} dev={device_id},ts={ts},n={nonce},sig={sig}")
}

/// A parsed `Authorization: SNM1 ...` header.
#[derive(Clone, PartialEq, Eq)]
pub struct SignedHeader {
    /// `dev=`.
    pub device_id: String,
    /// `ts=`, unix seconds.
    pub ts: i64,
    /// `n=`.
    pub nonce: String,
    /// `sig=`, decoded.
    pub sig: Vec<u8>,
}

impl std::fmt::Debug for SignedHeader {
    /// The signature is redacted, matching the logging rule for credentials.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SignedHeader")
            .field("device_id", &self.device_id)
            .field("ts", &self.ts)
            .field("sig", &"<redacted>")
            .finish_non_exhaustive()
    }
}

/// Parse an `Authorization` value. `None` for anything malformed; the caller
/// turns that into the same 404 as a bad signature.
pub fn parse_authorization(value: &str) -> Option<SignedHeader> {
    let rest = value.strip_prefix(AUTH_SCHEME)?.strip_prefix(' ')?;
    let (mut dev, mut ts, mut nonce, mut sig) = (None, None, None, None);
    for part in rest.split(',') {
        let (key, val) = part.trim().split_once('=')?;
        let slot = match key {
            "dev" => &mut dev,
            "ts" => &mut ts,
            "n" => &mut nonce,
            "sig" => &mut sig,
            _ => return None,
        };
        if slot.replace(val).is_some() {
            return None;
        }
    }
    let nonce = nonce?;
    if !(MIN_NONCE_LEN..=MAX_NONCE_LEN).contains(&nonce.len()) || !is_token(nonce) {
        return None;
    }
    let device_id = dev?;
    if device_id.is_empty() || device_id.len() > 64 || !is_token(device_id) {
        return None;
    }
    Some(SignedHeader {
        device_id: device_id.to_owned(),
        ts: ts?.parse().ok()?,
        nonce: nonce.to_owned(),
        sig: unb64(sig?)?,
    })
}

/// `[A-Za-z0-9_-]+`, the alphabet of ids and nonces.
fn is_token(text: &str) -> bool {
    text.bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Whether `ts` is inside the window around `now`.
pub fn is_fresh(ts: i64, now: i64) -> bool {
    (ts - now).abs() <= MAX_SKEW_SECS
}

/// Nonces seen inside the signature window, per device.
///
/// A nonce is remembered until its timestamp can no longer pass
/// [`is_fresh`], so the set is bounded by request rate times the window.
#[derive(Debug, Default)]
pub struct NonceCache {
    seen: Mutex<HashMap<(String, String), i64>>,
}

impl NonceCache {
    /// Record `(device, nonce)`. Returns `false` when it was already used.
    pub fn check_and_insert(&self, device_id: &str, nonce: &str, ts: i64, now: i64) -> bool {
        let mut seen = shiranami_core::sync::lock_or_recover(&self.seen);
        // Prune everything whose timestamp has left the window.
        seen.retain(|_, stamp| is_fresh(*stamp, now));
        seen.insert((device_id.to_owned(), nonce.to_owned()), ts)
            .is_none()
    }

    /// Forget a revoked device's nonces.
    pub fn forget(&self, device_id: &str) {
        shiranami_core::sync::lock_or_recover(&self.seen).retain(|(dev, _), _| dev != device_id);
    }
}

/// Random bytes from the OS CSPRNG.
///
/// # Panics
///
/// If the OS cannot produce randomness: a predictable pairing secret is an
/// open server, so there is no degraded mode.
pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0_u8; N];
    getrandom::fill(&mut bytes).expect("the OS CSPRNG must answer");
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 4231 test case 2, so the HMAC wiring is checked against the spec
    /// and not only against itself.
    #[test]
    fn hmac_matches_rfc_4231() {
        let tag = hmac_sha256(b"Jefe", b"what do ya want for nothing?");
        let hex: String = tag.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(
            hex,
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
    }

    #[test]
    fn a_header_round_trips() {
        let secret = [7_u8; 32];
        let value = authorization_header(
            "dev-1",
            &secret,
            "get",
            "/v1/sync/hello",
            100,
            "abcdefghijklmnop",
            b"",
        );
        let parsed = parse_authorization(&value).expect("parses");
        assert_eq!(parsed.device_id, "dev-1");
        assert_eq!(parsed.ts, 100);
        let payload = signing_payload("GET", "/v1/sync/hello", 100, &parsed.nonce, b"");
        assert!(hmac_verify(&secret, payload.as_bytes(), &parsed.sig));
    }

    #[test]
    fn malformed_headers_are_refused() {
        for bad in [
            "",
            "Bearer x",
            "SNM1 dev=a,ts=1,n=short,sig=AA",
            "SNM1 dev=a,ts=x,n=abcdefghijklmnop,sig=AA",
            "SNM1 dev=a,ts=1,n=abcdefghijklmnop,sig=AA,dev=b",
            "SNM1 dev=a b,ts=1,n=abcdefghijklmnop,sig=AA",
            "SNM1 dev=a,ts=1,n=abcdefghijklmnop,sig=!!",
        ] {
            assert!(parse_authorization(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn a_nonce_is_single_use_inside_the_window() {
        let cache = NonceCache::default();
        assert!(cache.check_and_insert("d", "n", 1000, 1000));
        assert!(!cache.check_and_insert("d", "n", 1000, 1001));
        assert!(cache.check_and_insert("other", "n", 1000, 1001));
        // Once the timestamp has aged out, the entry is pruned; a replay of it
        // would fail freshness anyway.
        assert!(cache.check_and_insert("d", "n", 2000, 2000));
    }

    #[test]
    fn freshness_is_symmetric() {
        assert!(is_fresh(1000, 1000 + MAX_SKEW_SECS));
        assert!(is_fresh(1000, 1000 - MAX_SKEW_SECS));
        assert!(!is_fresh(1000, 1000 + MAX_SKEW_SECS + 1));
    }

    #[test]
    fn a_signed_header_never_prints_its_signature() {
        let parsed = parse_authorization(&authorization_header(
            "d",
            &[1; 32],
            "GET",
            "/",
            1,
            "abcdefghijklmnop",
            b"",
        ))
        .expect("parses");
        assert!(format!("{parsed:?}").contains("<redacted>"));
    }
}
