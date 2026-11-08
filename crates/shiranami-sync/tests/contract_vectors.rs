//! Fixed vectors shared with `packages/contracts/src/sync/sync.test.ts`.
//!
//! The phone implements pairing and signing in TypeScript against
//! `@shiranami/contracts/sync`. Both suites assert the same literals, so a
//! change on either side that alters the bytes on the wire fails a test. The
//! constants the TS module mirrors are checked here against its source.

#![allow(clippy::unwrap_used)] // A test that cannot read its fixture should fail loudly.

use shiranami_sync::auth;
use shiranami_sync::pairing::{PAIR_LINK_PREFIX, PairingLink};
use shiranami_sync::wire::PROTOCOL_VERSION;
use x25519_dalek::{X25519_BASEPOINT_BYTES, x25519};

const SECRET: &str = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
/// RFC 7748 section 6.1: Alice plays the phone, Bob the desktop.
const PHONE_PRIVATE: &str = "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a";
const DESKTOP_PRIVATE: &str = "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb";
const PHONE_PUBLIC: &str = "hSDwCYkwp1R0i33ctD73Wg2_Og0mOBr066SpjqqbTmo";
const DESKTOP_PUBLIC: &str = "3p7bfXt9wbTTW2HC7OQ1Nz-DQ8hbeGdNrfx-FG-IK08";
const SHARED: &str = "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742";
const PROOF: &str = "viAAzEqSCV0va7LtCeoa647zZcs-C0cc5pbIDSF4fSs";
const KEY_PROOF: &str = "VdwbK1YiGfGj8J9oGYM1h15ys2YBY4qNODzpvlb6Nno";
const DEVICE_SECRET: &str = "R_T6TkxtTqk6KHHqxANdfbYs5MLiuZIJZvjiCB_Y8ew";
const SIGNATURE: &str = "qNUAzd9-_dlTBPKaWs2NP3q9LXVmauiBLGeZGzOSGkY";

fn unhex(text: &str) -> [u8; 32] {
    let bytes: Vec<u8> = (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&text[i..i + 2], 16).unwrap())
        .collect();
    bytes.try_into().unwrap()
}

#[test]
fn the_x25519_exchange_matches_rfc_7748_and_the_shared_vector() {
    let phone = unhex(PHONE_PRIVATE);
    let desktop = unhex(DESKTOP_PRIVATE);
    let phone_public = x25519(phone, X25519_BASEPOINT_BYTES);
    let desktop_public = x25519(desktop, X25519_BASEPOINT_BYTES);
    assert_eq!(auth::b64(&phone_public), PHONE_PUBLIC);
    assert_eq!(auth::b64(&desktop_public), DESKTOP_PUBLIC);
    assert_eq!(x25519(phone, desktop_public), unhex(SHARED));
    assert_eq!(x25519(desktop, phone_public), unhex(SHARED));
}

#[test]
fn the_pairing_proofs_and_device_secret_match_the_shared_vector() {
    let k = auth::unb64(SECRET).unwrap();
    assert_eq!(k, (0u8..32).collect::<Vec<_>>());
    assert_eq!(
        auth::pair_proof(&k, "nonce-0001", "Pixel 9", "android", PHONE_PUBLIC),
        PROOF
    );
    assert_eq!(
        auth::pair_response_proof(&k, "dev-0001", PHONE_PUBLIC, DESKTOP_PUBLIC),
        KEY_PROOF
    );
    let derived = auth::device_secret(
        &unhex(SHARED),
        "dev-0001",
        SECRET,
        PHONE_PUBLIC,
        DESKTOP_PUBLIC,
    );
    assert_eq!(auth::b64(&derived), DEVICE_SECRET);
}

#[test]
fn a_signed_request_matches_the_shared_vector() {
    let device_secret = auth::unb64(DEVICE_SECRET).unwrap();
    let header = auth::authorization_header(
        "dev-0001",
        &device_secret,
        "get",
        "/v1/sync/manifest?limit=2",
        1_762_600_000,
        "abcdefghijklmnop",
        b"",
    );
    assert_eq!(
        header,
        format!("SNM1 dev=dev-0001,ts=1762600000,n=abcdefghijklmnop,sig={SIGNATURE}")
    );
}

#[test]
fn the_shared_pairing_link_parses() {
    let link = format!(
        "{PAIR_LINK_PREFIX}v=2&h=192.168.1.20%2C10.0.0.5&p=53111&id=desk-1&n=Studio+PC&t=nonce-0001&k={SECRET}"
    );
    let parsed = PairingLink::parse(&link).unwrap();
    assert_eq!(parsed.hosts, ["192.168.1.20", "10.0.0.5"]);
    assert_eq!(parsed.port, 53111);
    assert_eq!(parsed.desktop_name, "Studio PC");
    assert_eq!(parsed.to_url(), link, "the desktop encodes the same bytes");
}

#[test]
fn the_typescript_mirror_carries_the_rust_constants() {
    let source = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/contracts/src/sync/index.ts"
    ))
    .unwrap();
    let service = shiranami_sync::mdns::SERVICE_TYPE.trim_end_matches(".local.");
    for expected in [
        format!("SYNC_PROTOCOL_VERSION = {PROTOCOL_VERSION};"),
        format!("SYNC_AUTH_SCHEME = '{}';", auth::AUTH_SCHEME),
        format!("SYNC_MAX_SKEW_SECONDS = {};", auth::MAX_SKEW_SECS),
        format!("SYNC_PAIR_PROOF_CONTEXT = '{}';", auth::PAIR_PROOF_CONTEXT),
        format!(
            "SYNC_PAIR_RESPONSE_CONTEXT = '{}';",
            auth::PAIR_RESPONSE_CONTEXT
        ),
        format!(
            "SYNC_DEVICE_SECRET_CONTEXT = '{}';",
            auth::DEVICE_SECRET_CONTEXT
        ),
        format!("SYNC_SERVICE_TYPE = '{service}';"),
        format!("SYNC_PAIR_LINK_PREFIX = '{PAIR_LINK_PREFIX}';"),
    ] {
        assert!(source.contains(&expected), "index.ts lacks `{expected}`");
    }
}
