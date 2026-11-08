//! The refusal matrix: every authentication failure is the same bare 404.

// Test code: a failed unwrap is a failed test, with the location in the panic.
#![allow(clippy::unwrap_used)]

mod common;

use common::{Harness, Phone};
use shiranami_sync::auth::authorization_header;

fn assert_bare_404(reply: &common::Reply, what: &str) {
    assert_eq!(reply.status, 404, "{what}");
    assert!(reply.body.is_empty(), "{what}: a refusal must say nothing");
}

#[tokio::test(flavor = "multi_thread")]
async fn every_auth_failure_is_a_bare_404() {
    let harness = Harness::start().await;
    let phone = harness.paired_phone().await;
    let path = "/v1/sync/hello";

    assert_bare_404(&phone.send("GET", path, None, &[]).await, "no header");
    assert_bare_404(
        &phone
            .send("GET", path, Some("Bearer abc".to_owned()), &[])
            .await,
        "wrong scheme",
    );

    let wrong_key = authorization_header(
        &phone.device_id,
        &[0_u8; 32],
        "GET",
        path,
        Phone::now(),
        &Phone::nonce(),
        b"",
    );
    assert_bare_404(
        &phone.send("GET", path, Some(wrong_key), &[]).await,
        "wrong key",
    );

    let unknown = authorization_header(
        "not-a-device",
        &phone.secret,
        "GET",
        path,
        Phone::now(),
        &Phone::nonce(),
        b"",
    );
    assert_bare_404(
        &phone.send("GET", path, Some(unknown), &[]).await,
        "unknown device",
    );

    let stale = authorization_header(
        &phone.device_id,
        &phone.secret,
        "GET",
        path,
        Phone::now() - 600,
        &Phone::nonce(),
        b"",
    );
    assert_bare_404(
        &phone.send("GET", path, Some(stale), &[]).await,
        "stale timestamp",
    );

    // Signed for one path, sent to another: the query is part of the payload.
    let signed_for_page_one = phone.auth("GET", "/v1/sync/manifest?limit=1");
    assert_bare_404(
        &phone
            .send(
                "GET",
                "/v1/sync/manifest?limit=1000",
                Some(signed_for_page_one),
                &[],
            )
            .await,
        "tampered query",
    );

    // A captured request replayed verbatim.
    let captured = phone.auth("GET", path);
    assert_eq!(
        phone
            .send("GET", path, Some(captured.clone()), &[])
            .await
            .status,
        200
    );
    assert_bare_404(
        &phone.send("GET", path, Some(captured), &[]).await,
        "replayed nonce",
    );

    // Unknown routes look exactly like refusals.
    assert_bare_404(&phone.get("/v1/sync/nope").await, "unknown route");
    assert_bare_404(&phone.get("/v2/sync/hello").await, "unknown version");

    // And the real thing still works.
    assert_eq!(phone.get(path).await.status, 200);
}

#[tokio::test(flavor = "multi_thread")]
async fn an_address_that_keeps_failing_is_refused_outright() {
    let harness = Harness::start().await;
    let phone = harness.paired_phone().await;
    for _ in 0..30 {
        assert_eq!(
            phone.send("GET", "/v1/sync/hello", None, &[]).await.status,
            404
        );
    }
    // Even a valid request waits out the block, and the block itself looks
    // like every other refusal.
    assert_bare_404(&phone.get("/v1/sync/hello").await, "a blocked address");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_captured_request_cannot_be_replayed_after_a_listener_restart() {
    let mut harness = Harness::start().await;
    let mut phone = harness.paired_phone().await;
    let path = "/v1/sync/hello";
    let captured = phone.auth("GET", path);
    assert_eq!(
        phone
            .send("GET", path, Some(captured.clone()), &[])
            .await
            .status,
        200
    );

    harness.restart().await;
    phone.base = harness.base.clone();

    assert_bare_404(
        &phone.send("GET", path, Some(captured), &[]).await,
        "replay after a restart",
    );
    assert_eq!(
        phone.get(path).await.status,
        200,
        "fresh requests still work"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_request_signed_before_the_process_started_is_refused() {
    let harness = Harness::start().await;
    let phone = harness.paired_phone().await;
    let path = "/v1/sync/hello";
    // Inside the skew window, but older than the replay cache: what a request
    // captured before an app restart looks like to the new process.
    let before_start = shiranami_sync::auth::authorization_header(
        &phone.device_id,
        &phone.secret,
        "GET",
        path,
        Phone::now() - 60,
        &Phone::nonce(),
        b"",
    );
    assert_bare_404(
        &phone.send("GET", path, Some(before_start), &[]).await,
        "signed before the process started",
    );
}
