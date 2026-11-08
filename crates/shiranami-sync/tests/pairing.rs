//! Pairing from the QR payload, the Allow / Deny prompt, and revocation.

// Test code: a failed unwrap is a failed test, with the location in the panic.
#![allow(clippy::unwrap_used)]

mod common;

use std::time::Duration;

use common::{Harness, Phone, send_pair};

#[tokio::test(flavor = "multi_thread")]
async fn a_phone_pairs_from_the_qr_and_says_hello() {
    let harness = Harness::start().await;
    let phone = harness.paired_phone().await;

    assert_eq!(phone.paired.desktop_id, harness.server.desktop_id());
    assert_eq!(phone.paired.desktop_name, "Test Desktop");
    assert_eq!(phone.paired.protocol_version, 1);

    let hello = phone.get("/v1/sync/hello").await;
    assert_eq!(hello.status, 200);
    let body = hello.json();
    assert_eq!(body["deviceId"], phone.device_id);
    assert_eq!(body["libraryId"], harness.server.library_id());
    assert!(
        body["capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c == "audio-range")
    );

    // The device is in the desktop's list, without its secret.
    let mut conn = harness.pool.acquire().await.unwrap();
    let devices = shiranami_sync::devices::list(&mut conn).await.unwrap();
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].name, "Pixel 8");
    assert_eq!(devices[0].platform, "android");
}

#[tokio::test(flavor = "multi_thread")]
async fn one_qr_pairs_exactly_one_phone() {
    let harness = Harness::start().await;
    let link = harness.qr();
    Phone::pair(&link, "First").await.unwrap();

    let second = send_pair(&link, "Second", None).await;
    assert_eq!(second.status, 410);
    assert_eq!(second.json()["error"], "pairing_closed");
    assert!(harness.server.status().pairing.is_none());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_bad_proof_is_a_bare_404_and_a_stale_qr_is_closed() {
    let harness = Harness::start().await;
    let stale = harness.qr();
    let link = harness.qr();

    let forged = send_pair(&link, "Mallory", Some("AAAA")).await;
    assert_eq!(forged.status, 404);
    assert!(forged.body.is_empty());

    let old = send_pair(&stale, "Pixel", None).await;
    assert_eq!(old.status, 410, "a replaced window's QR no longer pairs");

    assert!(Phone::pair(&link, "Pixel").await.is_ok());
}

#[tokio::test(flavor = "multi_thread")]
async fn pairing_is_rate_limited_per_address() {
    let harness = Harness::start().await;
    let link = harness.qr();
    for _ in 0..5 {
        assert_eq!(send_pair(&link, "x", Some("AAAA")).await.status, 404);
    }
    let limited = send_pair(&link, "x", None).await;
    assert_eq!(limited.status, 429);
    assert!(limited.headers.contains_key("retry-after"));
}

#[tokio::test(flavor = "multi_thread")]
async fn the_desktop_user_allows_or_denies() {
    let harness = Harness::start_with(true).await;

    // Allow.
    let link = harness.qr();
    let waiting = tokio::spawn(async move { Phone::pair(&link, "Pixel 8").await });
    let request_id = wait_for_pending(&harness).await;
    assert_eq!(
        harness.server.status().pending_pairs[0].device_name,
        "Pixel 8"
    );
    assert!(harness.server.respond_pairing(&request_id, true));
    let phone = waiting.await.unwrap().map_err(|r| r.status).unwrap();
    assert_eq!(phone.get("/v1/sync/hello").await.status, 200);
    assert!(harness.server.status().pending_pairs.is_empty());

    // Deny.
    let link = harness.qr();
    let waiting = tokio::spawn(async move { send_pair(&link, "Stranger", None).await });
    let request_id = wait_for_pending(&harness).await;
    assert!(harness.server.respond_pairing(&request_id, false));
    let denied = waiting.await.unwrap();
    assert_eq!(denied.status, 403);
    assert_eq!(denied.json()["error"], "pairing_denied");
    assert!(
        harness.server.status().pairing.is_none(),
        "a denial closes the window"
    );
}

async fn wait_for_pending(harness: &Harness) -> String {
    for _ in 0..200 {
        if let Some(pending) = harness.server.status().pending_pairs.first() {
            return pending.request_id.clone();
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("no pairing request arrived");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_revoked_device_gets_404() {
    let harness = Harness::start().await;
    let phone = harness.paired_phone().await;
    assert_eq!(phone.get("/v1/sync/hello").await.status, 200);

    let mut conn = harness.pool.acquire().await.unwrap();
    assert!(
        shiranami_sync::devices::revoke(&mut conn, &phone.device_id)
            .await
            .unwrap()
    );
    drop(conn);
    harness.server.forget_device(&phone.device_id);

    let after = phone.get("/v1/sync/hello").await;
    assert_eq!(after.status, 404);
    assert!(after.body.is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_phone_can_unpair_itself() {
    let harness = Harness::start().await;
    let phone = harness.paired_phone().await;
    let path = "/v1/sync/devices/self";
    let gone = phone
        .send("DELETE", path, Some(phone.auth("DELETE", path)), &[])
        .await;
    assert_eq!(gone.status, 204);
    assert_eq!(phone.get("/v1/sync/hello").await.status, 404);
}

#[tokio::test(flavor = "multi_thread")]
async fn shutdown_stops_the_listener() {
    let harness = Harness::start().await;
    let phone = harness.paired_phone().await;
    harness.server.shutdown().await;
    assert!(!harness.server.status().running);
    let refused = reqwest::Client::new()
        .get(format!("{}/v1/sync/hello", phone.base))
        .timeout(Duration::from_secs(2))
        .send()
        .await;
    assert!(refused.is_err(), "nothing listens after shutdown");
}
