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

const SECRET: &str = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const PROOF: &str = "YGweIeHph8FKkVl3njhjfgAINSbd4a1_mfrbCF9Eg40";
const DEVICE_SECRET: &str = "VbAJ1PZrcWHv9GgjkV1Vzy7JyIIYgl0BkhelhusLBNs";
const SIGNATURE: &str = "DfqZEExPhEqSto3riLwed5Rxm5tSUJ5vpusk3uR5oVc";

#[test]
fn the_pairing_proof_and_device_secret_match_the_shared_vector() {
    let k = auth::unb64(SECRET).unwrap();
    assert_eq!(k, (0u8..32).collect::<Vec<_>>());
    assert_eq!(auth::pair_proof(&k, "nonce-0001", "Pixel 9", "android"), PROOF);
    assert_eq!(auth::b64(&auth::device_secret(&k, "dev-0001")), DEVICE_SECRET);
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
        "{PAIR_LINK_PREFIX}v=1&h=192.168.1.20%2C10.0.0.5&p=53111&id=desk-1&n=Studio+PC&t=nonce-0001&k={SECRET}"
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
        format!("SYNC_DEVICE_SECRET_CONTEXT = '{}';", auth::DEVICE_SECRET_CONTEXT),
        format!("SYNC_SERVICE_TYPE = '{service}';"),
        format!("SYNC_PAIR_LINK_PREFIX = '{PAIR_LINK_PREFIX}';"),
    ] {
        assert!(source.contains(&expected), "index.ts lacks `{expected}`");
    }
}
