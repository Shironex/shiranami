//! The header set whose absence is silent.
//!
//! Spike A's anti-vacuity check (A3) stripped `Access-Control-Allow-Origin` from
//! a working server and measured the result: with `crossOrigin='anonymous'` the
//! load fails with `MediaError.code 4`; without the attribute the element plays
//! while the analyser reads exactly 0 RMS and every FFT bin at −Inf. Neither
//! failure names a header.
//!
//! So these tests assert presence on **every** response, including the refusals.
//! A 403 or a 416 that loses the header does not reach the renderer as a 403 or
//! a 416 — it reaches it as an opaque CORS failure, and the actual cause is
//! invisible from the console.

mod common;

use common::{Harness, Reply, TestResolver};
use reqwest::Response;
use reqwest::header::{
    ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_ORIGIN,
    ACCESS_CONTROL_EXPOSE_HEADERS,
};

/// The assertion every test in this file makes, named once.
fn assert_cors(response: &Response, context: &str) {
    let headers = response.headers();

    assert_eq!(
        headers
            .get(ACCESS_CONTROL_ALLOW_ORIGIN)
            .and_then(|value| value.to_str().ok()),
        Some("*"),
        "{context}: no Access-Control-Allow-Origin. On WKWebView this is a \
         silent player, not an error — see docs/v2/spike-a-results.md §2"
    );

    let allow_headers = headers
        .get(ACCESS_CONTROL_ALLOW_HEADERS)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    assert!(
        allow_headers.contains("Range"),
        "{context}: Range is not in Access-Control-Allow-Headers"
    );

    let expose = headers
        .get(ACCESS_CONTROL_EXPOSE_HEADERS)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    for required in ["Content-Range", "Content-Length", "Accept-Ranges"] {
        assert!(
            expose.contains(required),
            "{context}: {required} is not exposed, so a cross-origin reader \
             receives the bytes without being able to place them"
        );
    }

    assert!(
        headers.get(ACCESS_CONTROL_ALLOW_METHODS).is_some(),
        "{context}: no Access-Control-Allow-Methods"
    );
}

#[tokio::test]
async fn every_successful_media_response_carries_the_headers() {
    let harness = Harness::start().await;
    let audio = harness.write_audio("track.mp3", 512);
    harness.write_art("cover.jpg", 256);

    assert_cors(&harness.audio(&audio, &[]).await, "audio 200");
    assert_cors(
        &harness.audio(&audio, &[("Range", "bytes=0-1")]).await,
        "audio 206",
    );
    assert_cors(&harness.art("cover.jpg").await, "art 200");
}

/// The case a per-handler header set forgets. Each of these is a different code
/// path to a response, and all of them must carry the headers.
#[tokio::test]
async fn every_refusal_carries_the_headers_too() {
    let harness = Harness::start().await;
    let allowed = harness.write_audio("track.mp3", 512);
    let outside = harness.write_outside("elsewhere.mp3", 512);
    let not_audio = harness.write_audio("notes.txt", 512);

    // 400 — missing parameter.
    assert_cors(
        &harness.get(&format!("{}/audio", harness.base()), &[]).await,
        "audio 400",
    );
    // 403 — extension allowlist.
    assert_cors(&harness.audio(&not_audio, &[]).await, "audio 403 extension");
    // 403 — outside the allowed roots.
    assert_cors(&harness.audio(&outside, &[]).await, "audio 403 containment");
    // 404 — inside the roots, no such file.
    assert_cors(
        &harness
            .audio(&harness.music.path().join("ghost.mp3"), &[])
            .await,
        "audio 404",
    );
    // 416 — understood and unsatisfiable.
    assert_cors(
        &harness.audio(&allowed, &[("Range", "bytes=99999-")]).await,
        "audio 416",
    );
    // 404 — wrong token.
    assert_cors(
        &harness
            .get(&format!("{}/audio", harness.base_with_wrong_token()), &[])
            .await,
        "audio 404 wrong token",
    );
    // 403 — art traversal.
    assert_cors(&harness.art("..%2F..%2Fetc%2Fpasswd.jpg").await, "art 403");
    // 404 — art missing.
    assert_cors(&harness.art("missing.jpg").await, "art 404");
    // 404 — the router fallback.
    assert_cors(
        &harness
            .get(&format!("http://{}/nothing", harness.handle.address()), &[])
            .await,
        "router fallback 404",
    );
}

/// The refusals the *radio* route produces, including the SSRF one. A blocked
/// station that loses the header looks to the renderer exactly like a station
/// that is merely down.
#[tokio::test]
async fn radio_refusals_carry_the_headers() {
    let harness = Harness::start().await;

    // 400 — missing parameter.
    assert_cors(
        &harness.get(&format!("{}/radio", harness.base()), &[]).await,
        "radio 400",
    );
    // 403 — the guard refused a loopback literal.
    assert_cors(
        &harness.radio("http://127.0.0.1:9/live").await,
        "radio 403 private ip",
    );
    // 403 — a scheme the guard does not allow.
    assert_cors(
        &harness.radio("file:///etc/passwd").await,
        "radio 403 scheme",
    );
}

#[tokio::test]
async fn a_proxied_radio_stream_carries_the_headers() {
    let station = "http://stream.example.com/live";
    let harness = Harness::start_with(
        common::FakeUpstream::new().answering(station, Reply::ok("audio/mpeg", "sound")),
        TestResolver::new().answering("stream.example.com", &["93.184.216.34"]),
    )
    .await;

    assert_cors(&harness.radio(station).await, "radio 200");
}

/// A method the routes do not answer still goes through the layer. axum
/// generates this response itself, which is precisely why the layer wraps the
/// router rather than the handlers.
#[tokio::test]
async fn an_unsupported_method_still_carries_the_headers() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", 64);
    let url = format!(
        "{}/audio?path={}",
        harness.base(),
        common::encode(&path.to_string_lossy())
    );

    let response = harness
        .client
        .post(&url)
        .send()
        .await
        .expect("the request reaches the server");

    assert_cors(&response, "audio 405");
}

/// `*` and not the webview's origin. The architecture's table named the origin;
/// Spike A's amendment settled on `*`, which is sufficient in anonymous mode and
/// is the value that cannot later be mistaken for a credentialed configuration.
#[tokio::test]
async fn the_allowed_origin_is_the_wildcard_not_an_echo() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", 64);

    let response = harness
        .audio(&path, &[("Origin", "tauri://localhost")])
        .await;

    assert_eq!(
        response
            .headers()
            .get(ACCESS_CONTROL_ALLOW_ORIGIN)
            .and_then(|value| value.to_str().ok()),
        Some("*"),
        "echoing the request's Origin is the shape that later grows credentials"
    );
}

/// The suite above asserts presence on every response. This one asserts the
/// suite can tell.
///
/// `assert_cors` is the only thing standing between a header regression and a
/// silent player, and an assertion nobody has ever seen fail is an assertion
/// nobody knows works. So: the same router, over a real `ServeState`, with one
/// extra layer deleting `Access-Control-Allow-Origin` on the way out. The
/// response must be one this file rejects.
///
/// `scripts/analyser-canary.mjs` proves the same property through a browser's
/// audio graph, where the consequence is audible; this is the cheap twin that
/// runs in `rust-checks` on every pull request without a browser download.
#[tokio::test]
async fn the_presence_assertion_is_falsifiable() {
    let control = common::start_stripped().await;

    let url = format!(
        "{}/audio?path={}",
        control.base,
        common::encode(&control.audio.to_string_lossy())
    );
    let response = control
        .client
        .get(&url)
        .send()
        .await
        .expect("the control server answers");

    assert!(
        response.status().is_success(),
        "the control must differ from a served response by one header and \
         nothing else, or it is not a control"
    );
    assert!(
        response
            .headers()
            .get(ACCESS_CONTROL_ALLOW_ORIGIN)
            .is_none(),
        "the control server still sent Access-Control-Allow-Origin, so the \
         stripping layer no longer strips and this test proves nothing"
    );
}
