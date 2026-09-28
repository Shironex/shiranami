//! Stopping the server while responses are still open.
//!
//! The shell stops this server on the main thread as the app quits, so a
//! shutdown that waits on a response which never ends is an app that cannot be
//! quit. Two responses never end on their own: a live radio stream, and a file
//! response whose client stopped reading (a paused `<audio>` holding its
//! range). Each test below holds one open and proves `shutdown` still returns.
//! The outer `timeout` is only the test's own safety net, far above the bound
//! under test, so a regression fails here instead of hanging the suite.

mod common;

use std::time::{Duration, Instant};

use common::{FakeUpstream, Harness, Reply, TestResolver};
use reqwest::StatusCode;
use shiranami_serve::SHUTDOWN_GRACE;

const STATION: &str = "http://stream.example.com/live";
const SAFETY_NET: Duration = Duration::from_secs(20);

fn resolver() -> TestResolver {
    TestResolver::new().answering("stream.example.com", &["93.184.216.34"])
}

/// A station plays forever, and the listener is still listening when the app
/// quits. The shutdown signal ends the stream itself: the listener sees a
/// clean end of body. Without the signal the only way out would be the grace
/// period's abort, which stops the server task but leaves the connection
/// streaming, so the listener would never see an end.
#[tokio::test]
async fn a_live_radio_stream_ends_on_shutdown() {
    let harness = Harness::start_with(
        FakeUpstream::new().answering(STATION, Reply::endless("chunk")),
        resolver(),
    )
    .await;

    let mut response = harness.radio(STATION).await;
    assert_eq!(response.status(), StatusCode::OK);
    let first = response
        .chunk()
        .await
        .expect("the stream continues")
        .expect("a live stream keeps sending");

    // Keep reading, as the webview's media element would, and report how the
    // body ended.
    let listener = tokio::spawn(async move {
        let mut received = first.len();
        loop {
            match response.chunk().await {
                Ok(Some(chunk)) => received += chunk.len(),
                Ok(None) => return (received, true),
                Err(_) => return (received, false),
            }
        }
    });

    let started = Instant::now();
    tokio::time::timeout(SAFETY_NET, harness.handle.shutdown())
        .await
        .expect("shutdown returns while radio is playing");
    let elapsed = started.elapsed();
    assert!(
        elapsed < SHUTDOWN_GRACE + Duration::from_secs(2),
        "shutdown is bounded by the grace period: {elapsed:?}"
    );

    let (received, clean) = tokio::time::timeout(SAFETY_NET, listener)
        .await
        .expect("the stream ended for its listener")
        .expect("the listener task finished");
    assert!(received > 0);
    assert!(clean, "the radio body ends cleanly on the shutdown signal");
}

/// A client that stopped reading halfway through a large file. Its response is
/// never polled again, so nothing inside it can notice the shutdown; only the
/// bound on the wait gets the app out.
#[tokio::test]
async fn a_response_nobody_reads_does_not_hold_up_a_shutdown_past_the_grace() {
    let harness = Harness::start().await;
    // Far more than the loopback socket buffers hold, so the server stalls.
    let path = harness.write_audio("long.flac", 64 * 1024 * 1024);

    let response = harness.audio(&path, &[]).await;
    assert!(response.status().is_success());

    let started = Instant::now();
    tokio::time::timeout(SAFETY_NET, harness.handle.shutdown())
        .await
        .expect("shutdown returns while a response is stalled");

    let elapsed = started.elapsed();
    assert!(
        elapsed < SHUTDOWN_GRACE + Duration::from_secs(2),
        "shutdown is bounded by the grace period: {elapsed:?}"
    );
    drop(response);
}

/// A second call finds nothing left to stop and returns at once.
#[tokio::test]
async fn a_second_shutdown_returns_immediately() {
    let harness = Harness::start().await;

    harness.handle.shutdown().await;
    let started = Instant::now();
    harness.handle.shutdown().await;

    assert!(started.elapsed() < Duration::from_millis(500));
}
