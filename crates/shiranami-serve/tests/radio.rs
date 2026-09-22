//! The radio proxy, and the redirect hop that is the whole point of it.
//!
//! Station URLs come from radio-browser.info, a worldwide user-editable
//! directory. They are untrusted input handed straight to an HTTP client, which
//! is the textbook SSRF shape, and a station that answers
//! `302 Location: http://169.254.169.254/…` would turn the app into a proxy onto
//! the user's own network.
//!
//! The transport here is a fake so a redirect chain can be a fixture. **The
//! guard is not.** It is the real [`shiranami_net::url_safety::UrlGuard`] over a
//! canned resolver, so every refusal below is the real address classifier
//! refusing — and the `requested()` assertions prove no request went out, rather
//! than merely that the response was a 403.

mod common;

use bytes::Bytes;
use common::{FakeUpstream, Harness, Reply, ReplyBody, TestResolver};
use reqwest::StatusCode;
use reqwest::header::{ACCEPT_RANGES, CACHE_CONTROL, CONTENT_TYPE};

const STATION: &str = "http://stream.example.com/live";

/// A resolver that answers the public station hosts these tests use.
fn resolver() -> TestResolver {
    TestResolver::new()
        .answering("stream.example.com", &["93.184.216.34"])
        .answering("cdn.example.net", &["93.184.216.35"])
        .answering("evil.example.com", &["127.0.0.1"])
        .answering("metadata.example.com", &["169.254.169.254"])
        .answering("internal.example.com", &["10.0.0.5"])
        .answering("mixed.example.com", &["93.184.216.34", "192.168.1.1"])
}

fn header(response: &reqwest::Response, name: reqwest::header::HeaderName) -> String {
    response
        .headers()
        .get(&name)
        .unwrap_or_else(|| panic!("the response carries no {name}"))
        .to_str()
        .expect("the header is readable")
        .to_owned()
}

#[tokio::test]
async fn a_station_is_proxied_with_its_content_type() {
    let harness = Harness::start_with(
        FakeUpstream::new().answering(STATION, Reply::ok("audio/aacp", "stream bytes")),
        resolver(),
    )
    .await;

    let response = harness.radio(STATION).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(header(&response, CONTENT_TYPE), "audio/aacp");
    // A live stream has no seekable extent, and saying so stops the media
    // element from issuing Range requests a station answers by restarting.
    assert_eq!(header(&response, ACCEPT_RANGES), "none");
    assert!(header(&response, CACHE_CONTROL).contains("no-store"));
    assert_eq!(response.text().await.expect("a body"), "stream bytes");
}

/// A station that sends no `Content-Type` still has to decode, so it gets v1's
/// default rather than nothing.
#[tokio::test]
async fn a_station_without_a_content_type_gets_the_default() {
    let harness = Harness::start_with(
        FakeUpstream::new().answering(
            STATION,
            Reply {
                status: 200,
                headers: Vec::new(),
                body: common::ReplyBody::Chunks(vec![bytes::Bytes::from_static(b"sound")]),
            },
        ),
        resolver(),
    )
    .await;

    assert_eq!(
        header(&harness.radio(STATION).await, CONTENT_TYPE),
        "audio/mpeg"
    );
}

/// The ordinary case: a station redirects to its CDN, both hosts are public,
/// and both are checked.
#[tokio::test]
async fn a_redirect_to_a_public_host_is_followed() {
    let target = "http://cdn.example.net/live.mp3";
    let harness = Harness::start_with(
        FakeUpstream::new()
            .answering(STATION, Reply::redirect(302, target))
            .answering(target, Reply::ok("audio/mpeg", "cdn bytes")),
        resolver(),
    )
    .await;

    let response = harness.radio(STATION).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.text().await.expect("a body"), "cdn bytes");
    assert_eq!(harness.upstream.requested(), vec![STATION, target]);
}

#[tokio::test]
async fn every_redirect_status_is_followed() {
    for status in [301, 302, 303, 307, 308] {
        let target = "http://cdn.example.net/live.mp3";
        let harness = Harness::start_with(
            FakeUpstream::new()
                .answering(STATION, Reply::redirect(status, target))
                .answering(target, Reply::ok("audio/mpeg", "cdn bytes")),
            resolver(),
        )
        .await;

        assert_eq!(
            harness.radio(STATION).await.status(),
            StatusCode::OK,
            "a {status} was not followed"
        );
    }
}

/// The test this module exists for. Each of these hosts resolves to an address
/// the guard denies, and the assertion that matters is the second one: the
/// refused URL never appears in the request log, so nothing was sent.
#[tokio::test]
async fn a_redirect_to_a_private_address_is_refused_before_the_request() {
    for hostile in [
        "http://evil.example.com/live",       // loopback
        "http://metadata.example.com/latest", // link-local, the cloud metadata service
        "http://internal.example.com/admin",  // private range
        "http://mixed.example.com/live",      // one public answer, one private
        "http://127.0.0.1:9/live",            // loopback literal
        "http://[::1]:9/live",                // loopback literal, v6
        "http://169.254.169.254/latest",      // link-local literal
        "http://10.0.0.5/admin",              // private literal
    ] {
        let harness = Harness::start_with(
            FakeUpstream::new()
                .answering(STATION, Reply::redirect(302, hostile))
                // Scripted so that *if* the guard let it through, the test would
                // see a 200 rather than an ambiguous transport failure.
                .answering(hostile, Reply::ok("audio/mpeg", "SHOULD NEVER BE REACHED")),
            resolver(),
        )
        .await;

        let response = harness.radio(STATION).await;

        assert_eq!(
            response.status(),
            StatusCode::FORBIDDEN,
            "a redirect to {hostile} was followed"
        );
        assert_eq!(
            response.text().await.expect("a body"),
            "Forbidden",
            "the refusal named its reason, which lets a caller map the network"
        );
        assert_eq!(
            harness.upstream.requested(),
            vec![STATION],
            "a request went out to {hostile} before it was refused"
        );
    }
}

/// The same classifier applied to the URL the renderer supplied, before any hop.
#[tokio::test]
async fn a_private_station_url_is_refused_outright() {
    for hostile in [
        "http://127.0.0.1:9/live",
        "http://192.168.1.1/live",
        "http://evil.example.com/live",
    ] {
        let harness = Harness::start_with(
            FakeUpstream::new().answering(hostile, Reply::ok("audio/mpeg", "NEVER")),
            resolver(),
        )
        .await;

        assert_eq!(
            harness.radio(hostile).await.status(),
            StatusCode::FORBIDDEN,
            "{hostile} was requested"
        );
        assert!(
            harness.upstream.requested().is_empty(),
            "a request went out to {hostile}"
        );
    }
}

#[tokio::test]
async fn a_non_http_scheme_is_refused() {
    let harness = Harness::start_with(FakeUpstream::new(), resolver()).await;

    for url in [
        "file:///etc/passwd",
        "ftp://example.com/live",
        "javascript:alert(1)",
        "data:audio/mpeg;base64,AAAA",
        "not a url",
    ] {
        assert_eq!(
            harness.radio(url).await.status(),
            StatusCode::FORBIDDEN,
            "{url} was not refused"
        );
    }
    assert!(harness.upstream.requested().is_empty());
}

/// A name that cannot be resolved cannot be classified, so it fails closed.
#[tokio::test]
async fn an_unresolvable_host_is_refused() {
    let harness = Harness::start_with(FakeUpstream::new(), TestResolver::new()).await;

    assert_eq!(
        harness
            .radio("http://unknown.example.com/live")
            .await
            .status(),
        StatusCode::FORBIDDEN
    );
    assert!(harness.upstream.requested().is_empty());
}

/// Five hops are followed; the sixth is refused. A station that redirects
/// forever is a station that would otherwise hold a connection open forever.
#[tokio::test]
async fn a_redirect_chain_is_capped_at_five_hops() {
    let hop = |index: usize| format!("http://cdn.example.net/hop-{index}");

    // Five redirects then a destination: the last hop is followed.
    let mut upstream = FakeUpstream::new().answering(STATION, Reply::redirect(302, &hop(1)));
    for index in 1..5 {
        upstream = upstream.answering(&hop(index), Reply::redirect(302, &hop(index + 1)));
    }
    upstream = upstream.answering(&hop(5), Reply::ok("audio/mpeg", "arrived"));

    let harness = Harness::start_with(upstream, resolver()).await;
    let response = harness.radio(STATION).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.text().await.expect("a body"), "arrived");
    assert_eq!(harness.upstream.requested().len(), 6);
}

#[tokio::test]
async fn a_sixth_redirect_is_refused() {
    let hop = |index: usize| format!("http://cdn.example.net/hop-{index}");

    let mut upstream = FakeUpstream::new().answering(STATION, Reply::redirect(302, &hop(1)));
    for index in 1..=6 {
        upstream = upstream.answering(&hop(index), Reply::redirect(302, &hop(index + 1)));
    }

    let harness = Harness::start_with(upstream, resolver()).await;
    let response = harness.radio(STATION).await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(
        harness.upstream.requested().len(),
        6,
        "the cap must stop the loop, not merely refuse its result"
    );
}

/// v1 resolved a relative `Location` against the URL that produced it. A proxy
/// that dropped relative targets would break every station that sends one.
#[tokio::test]
async fn a_relative_redirect_resolves_against_its_own_hop() {
    let harness = Harness::start_with(
        FakeUpstream::new()
            .answering(STATION, Reply::redirect(302, "/actual.mp3"))
            .answering(
                "http://stream.example.com/actual.mp3",
                Reply::ok("audio/mpeg", "relative"),
            ),
        resolver(),
    )
    .await;

    let response = harness.radio(STATION).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.text().await.expect("a body"), "relative");
    assert_eq!(
        harness.upstream.requested(),
        vec![STATION, "http://stream.example.com/actual.mp3"]
    );
}

/// A relative redirect that climbs to a different, private host is still
/// re-classified after resolution.
#[tokio::test]
async fn a_relative_redirect_to_a_private_host_is_still_refused() {
    let harness = Harness::start_with(
        FakeUpstream::new().answering(STATION, Reply::redirect(302, "//evil.example.com/live")),
        resolver(),
    )
    .await;

    assert_eq!(harness.radio(STATION).await.status(), StatusCode::FORBIDDEN);
    assert_eq!(harness.upstream.requested(), vec![STATION]);
}

/// A station that is down is the station's problem, and its status is the
/// renderer's business — unlike our own refusals, which are deliberately mute.
#[tokio::test]
async fn an_upstream_failure_forwards_its_status() {
    for status in [404, 429, 500, 503] {
        let harness = Harness::start_with(
            FakeUpstream::new().answering(STATION, Reply::failure(status)),
            resolver(),
        )
        .await;

        let response = harness.radio(STATION).await;

        assert_eq!(response.status().as_u16(), status);
        assert_eq!(
            response.text().await.expect("a body"),
            format!("Upstream error: {status}")
        );
    }
}

#[tokio::test]
async fn a_missing_url_parameter_is_a_bad_request() {
    let harness = Harness::start_with(FakeUpstream::new(), resolver()).await;

    for url in [
        format!("{}/radio", harness.base()),
        format!("{}/radio?url=", harness.base()),
        format!("{}/radio?other=1", harness.base()),
    ] {
        assert_eq!(
            harness.get(&url, &[]).await.status(),
            StatusCode::BAD_REQUEST
        );
    }
}

/// A live stream never ends. The proxy must answer as soon as the head arrives
/// and forward chunks as they come — waiting for the body would mean a station
/// that plays forever is a request that never returns.
#[tokio::test]
async fn a_live_stream_is_forwarded_without_waiting_for_it_to_end() {
    let harness = Harness::start_with(
        FakeUpstream::new().answering(STATION, Reply::endless("chunk")),
        resolver(),
    )
    .await;

    let mut response = harness.radio(STATION).await;
    assert_eq!(response.status(), StatusCode::OK);

    // Read a few chunks off a body that has no end, then hang up. Reaching this
    // point at all is the assertion: a buffering proxy would still be reading.
    let mut received = 0_usize;
    for _ in 0..3 {
        let chunk = response
            .chunk()
            .await
            .expect("the stream continues")
            .expect("a live stream keeps sending");
        received += chunk.len();
    }

    assert!(received > 0);
    drop(response);
}

// ── ICY metadata ──────────────────────────────────────────────────────────
//
// v1 declined stream metadata (`icy-metadata: 0`) and therefore never had to
// de-frame anything. v2 asks for it, which changes the body from audio into
// audio interleaved with metadata blocks — so the assertion that matters here
// is not "the title arrived", it is **"the audio is byte-identical"**. A
// mistake in the framing does not fail loudly; it plays clicks.
//
// The framing state machine has its own unit tests over chunk-boundary
// permutations (`src/icy/deframe.rs`). These prove the wiring: that the route
// only de-frames when the station granted a period, and that a title reaches
// the sink with the URL the renderer asked for rather than the one the redirect
// chain landed on.

/// A station reply carrying ICY frames on a period of `metaint`.
fn icy_reply(metaint: usize, chunks: Vec<Bytes>) -> Reply {
    Reply {
        status: 200,
        headers: vec![
            ("content-type", "audio/mpeg".to_owned()),
            ("icy-metaint", metaint.to_string()),
        ],
        body: ReplyBody::Chunks(chunks),
    }
}

/// One metadata block, length-prefixed and NUL-padded as a station sends it.
fn icy_block(body: &str) -> Vec<u8> {
    let mut bytes = body.as_bytes().to_vec();
    while !bytes.len().is_multiple_of(16) {
        bytes.push(0);
    }
    let mut framed = vec![u8::try_from(bytes.len() / 16).expect("a short block")];
    framed.extend_from_slice(&bytes);
    framed
}

/// `n` bytes of recognisable pseudo-audio.
fn pcm(n: usize, seed: u8) -> Vec<u8> {
    (0..n)
        .map(|i| u8::try_from(i % 251).expect("under 251").wrapping_add(seed))
        .collect()
}

#[tokio::test]
async fn an_icy_stream_reaches_the_decoder_with_no_metadata_in_it() {
    const METAINT: usize = 32;

    let mut framed = pcm(METAINT, 0);
    framed.extend_from_slice(&icy_block("StreamTitle='Cornelius - Drop';"));
    framed.extend_from_slice(&pcm(METAINT, 7));
    framed.push(0); // a period with nothing new to say
    framed.extend_from_slice(&pcm(METAINT, 13));

    let mut audio = pcm(METAINT, 0);
    audio.extend_from_slice(&pcm(METAINT, 7));
    audio.extend_from_slice(&pcm(METAINT, 13));

    // Split at a point that cuts the first block in half, because a station's
    // chunking has nothing to do with its metaint and this is the boundary that
    // corrupts audio when it is handled wrongly.
    let cut = METAINT + 8;
    let harness = Harness::start_with(
        FakeUpstream::new().answering(
            STATION,
            icy_reply(
                METAINT,
                vec![
                    Bytes::copy_from_slice(&framed[..cut]),
                    Bytes::copy_from_slice(&framed[cut..]),
                ],
            ),
        ),
        resolver(),
    )
    .await;

    let response = harness.radio(STATION).await;
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.bytes().await.expect("a body");
    assert_eq!(
        body.as_ref(),
        audio.as_slice(),
        "a metadata byte reaching the decoder is a click the user hears"
    );

    let titles = harness.titles.lock().expect("not poisoned");
    assert_eq!(titles.len(), 1);
    assert_eq!(titles[0].raw, "Cornelius - Drop");
    assert_eq!(titles[0].artist.as_deref(), Some("Cornelius"));
    assert_eq!(titles[0].title.as_deref(), Some("Drop"));
}

/// A station that ignores `Icy-MetaData: 1` sends plain audio, and every byte
/// of it is audio — including bytes that would look like a length prefix.
#[tokio::test]
async fn a_station_that_grants_no_metaint_is_forwarded_untouched() {
    let audio = pcm(512, 3);
    let harness = Harness::start_with(
        FakeUpstream::new().answering(
            STATION,
            Reply {
                status: 200,
                headers: vec![("content-type", "audio/mpeg".to_owned())],
                body: ReplyBody::Chunks(vec![Bytes::copy_from_slice(&audio)]),
            },
        ),
        resolver(),
    )
    .await;

    let body = harness.radio(STATION).await.bytes().await.expect("a body");

    assert_eq!(body.as_ref(), audio.as_slice());
    assert!(harness.titles.lock().expect("not poisoned").is_empty());
}

/// The now-playing event is addressed by the URL the **renderer** asked for.
/// After a redirect the proxy is talking to a CDN edge the renderer has never
/// heard of, and a payload naming that URL would match nothing it is playing.
#[tokio::test]
async fn a_title_is_reported_against_the_url_the_renderer_asked_for() {
    const METAINT: usize = 16;
    const EDGE: &str = "http://cdn.example.net/live";

    let mut framed = pcm(METAINT, 0);
    framed.extend_from_slice(&icy_block("StreamTitle='Redirected - Still Playing';"));

    let harness = Harness::start_with(
        FakeUpstream::new()
            .answering(STATION, Reply::redirect(302, EDGE))
            .answering(
                EDGE,
                icy_reply(METAINT, vec![Bytes::copy_from_slice(&framed)]),
            ),
        resolver(),
    )
    .await;

    assert_eq!(harness.radio(STATION).await.status(), StatusCode::OK);

    let titles = harness.titles.lock().expect("not poisoned");
    assert_eq!(titles.len(), 1);
    assert_eq!(titles[0].stream_url, STATION);
    assert_eq!(titles[0].raw, "Redirected - Still Playing");
}
