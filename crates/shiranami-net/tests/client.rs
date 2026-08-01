//! End-to-end tests for [`HttpClient`] against a real loopback socket.
//!
//! These cover the request core ported from `requestBufferRaw`: status
//! handling, the optional error-body read, the `max_bytes` cap, the deadline,
//! and the SSRF guard's position *before* any network I/O. The rate-gate
//! arithmetic is unit-tested against a paused clock inside the crate; what is
//! interesting here is the wire.

mod support;

use std::time::Duration;

use serde::Deserialize;
use shiranami_net::{HttpClient, HttpError, RequestOptions, UrlGuardReason};
use support::test_server::{Reply, TestServer};

fn client() -> HttpClient {
    HttpClient::new().expect("the shared client builds")
}

#[tokio::test]
async fn fetches_a_body_as_text() {
    let server = TestServer::start(vec![Reply::ok("hello")]).await;
    let body = client()
        .text(&server.url("/a"), RequestOptions::default())
        .await
        .expect("a 200 resolves");

    assert_eq!(body, "hello");
    assert_eq!(server.received(), 1);
}

#[tokio::test]
async fn sends_the_user_agent_that_github_requires() {
    let server = TestServer::start(vec![Reply::ok("")]).await;
    client()
        .text(&server.url("/a"), RequestOptions::default())
        .await
        .expect("a 200 resolves");

    let request = server.requests().remove(0).to_lowercase();
    assert!(
        request.contains("user-agent: shiranami/"),
        "api.github.com answers 403 without one; got:\n{request}"
    );
}

#[tokio::test]
async fn a_post_carries_its_method_and_body() {
    let server = TestServer::start(vec![Reply::ok("{}")]).await;
    client()
        .text(&server.url("/submit"), RequestOptions::post(r#"{"a":1}"#))
        .await
        .expect("a 200 resolves");

    let request = server.requests().remove(0);
    assert!(request.starts_with("POST /submit"), "got:\n{request}");
    assert!(request.ends_with(r#"{"a":1}"#), "got:\n{request}");
}

/// The default path rejects on a non-2xx *without* reading the body, which is
/// the behaviour `read_error_body` exists to opt out of.
#[tokio::test]
async fn a_failure_status_rejects_without_the_body() {
    let server = TestServer::start(vec![Reply::failing(500, "the server is unwell")]).await;
    let error = client()
        .text(&server.url("/a"), RequestOptions::default())
        .await
        .expect_err("a 500 rejects");

    assert_eq!(error.status().map(|status| status.as_u16()), Some(500));
    assert_eq!(error.body_text(), None);
    assert!(error.to_string().contains("500"));
}

#[tokio::test]
async fn read_error_body_attaches_the_server_message() {
    let server = TestServer::start(vec![Reply::failing(400, "playlist is private")]).await;
    let error = client()
        .text(
            &server.url("/a"),
            RequestOptions::default().reading_error_body(),
        )
        .await
        .expect_err("a 400 rejects");

    assert_eq!(error.body_text(), Some("playlist is private"));
}

/// The clamp and the header parsing meeting the wire: a 429 arrives with a
/// hint, and the error carries it in a form the gate can use.
#[tokio::test]
async fn a_rate_limited_response_carries_its_retry_hint() {
    let server = TestServer::start(vec![Reply::new(429, &[("retry-after", "3")], "")]).await;
    let error = client()
        .text(&server.url("/a"), RequestOptions::default())
        .await
        .expect_err("a 429 rejects");

    assert!(error.is_rate_limited());
    assert_eq!(error.retry_after(), Some(Duration::from_secs(3)));
}

#[tokio::test]
async fn an_oversized_response_is_abandoned() {
    let server = TestServer::start(vec![Reply::ok(&"x".repeat(2_048))]).await;
    let error = client()
        .bytes(
            &server.url("/a"),
            RequestOptions::default().with_max_bytes(512),
        )
        .await
        .expect_err("an oversized body rejects");

    assert!(
        matches!(error, HttpError::TooLarge { max_bytes: 512, .. }),
        "got {error:?}"
    );
}

/// The cap is inclusive: a body of exactly `max_bytes` is not oversized. An
/// exclusive comparison here would reject every response that happens to land
/// on a round number.
#[tokio::test]
async fn a_body_exactly_at_the_cap_is_allowed() {
    let server = TestServer::start(vec![Reply::ok(&"x".repeat(512))]).await;
    let body = client()
        .bytes(
            &server.url("/a"),
            RequestOptions::default().with_max_bytes(512),
        )
        .await
        .expect("a body at the cap resolves");

    assert_eq!(body.len(), 512);
}

#[tokio::test]
async fn a_silent_server_trips_the_deadline() {
    let server = TestServer::start(vec![Reply::Hang]).await;
    let error = client()
        .text(
            &server.url("/a"),
            RequestOptions::default().with_timeout(Duration::from_millis(150)),
        )
        .await
        .expect_err("a silent server rejects");

    assert!(matches!(error, HttpError::Timeout { .. }), "got {error:?}");
    assert!(error.to_string().contains("150ms"));
}

#[derive(Debug, Deserialize, PartialEq)]
struct Track {
    title: String,
}

#[tokio::test]
async fn json_deserializes_the_body() {
    let server = TestServer::start(vec![Reply::ok(r#"{"title":"Racing Into The Night"}"#)]).await;
    let track: Track = client()
        .json(&server.url("/a"), RequestOptions::default())
        .await
        .expect("valid JSON deserializes");

    assert_eq!(
        track,
        Track {
            title: "Racing Into The Night".to_owned()
        }
    );
}

#[tokio::test]
async fn json_reports_an_unparseable_body_as_such() {
    let server = TestServer::start(vec![Reply::ok("<html>not json</html>")]).await;
    let error = client()
        .json::<Track>(&server.url("/a"), RequestOptions::default())
        .await
        .expect_err("HTML is not JSON");

    assert!(matches!(error, HttpError::Json { .. }), "got {error:?}");
}

/// The whole point of the guard: it runs *before* the request, so a refused URL
/// produces no connection at all. The test server is on loopback, which is
/// exactly what the guard exists to refuse — so `received() == 0` is the
/// assertion that matters.
#[tokio::test]
async fn the_guard_refuses_a_loopback_url_before_connecting() {
    let server = TestServer::start(vec![Reply::ok("secrets")]).await;
    let error = client()
        .text(&server.url("/admin"), RequestOptions::guarded())
        .await
        .expect_err("loopback is refused");

    assert!(
        matches!(
            error,
            HttpError::Blocked {
                reason: UrlGuardReason::PrivateIp,
                ..
            }
        ),
        "got {error:?}"
    );
    assert_eq!(server.received(), 0, "the request must never have gone out");
}

/// The control for the test above: the same URL succeeds unguarded, so what
/// refused it was the guard and not the server being unreachable.
#[tokio::test]
async fn the_same_url_succeeds_unguarded() {
    let server = TestServer::start(vec![Reply::ok("secrets")]).await;
    let body = client()
        .text(&server.url("/admin"), RequestOptions::default())
        .await
        .expect("unguarded loopback resolves");

    assert_eq!(body, "secrets");
    assert_eq!(server.received(), 1);
}

/// A failure below the status line is a `Transport`, not a `Status` with some
/// invented code — the distinction the flat `Error`s of v1 could not express.
#[tokio::test]
async fn a_refused_connection_is_a_transport_failure() {
    // The discard port. Nothing listens there, and connecting is refused
    // immediately rather than hanging, so no timeout is involved.
    let error = client()
        .text(
            "http://127.0.0.1:9/a",
            RequestOptions::default().with_timeout(Duration::from_secs(5)),
        )
        .await
        .expect_err("nothing is listening on the discard port");

    assert!(
        matches!(error, HttpError::Transport { .. }),
        "got {error:?}"
    );
}
