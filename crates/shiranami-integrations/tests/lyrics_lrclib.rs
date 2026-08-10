//! LRCLIB against a real socket: URL construction, the get→search fallback,
//! and the miss-versus-failure split.
//!
//! v1's suite mocked `lrclib-api` itself, so it never asserted a single byte of
//! the URLs that actually went out. These do, because the wire shape is the
//! part of the port most likely to be subtly wrong and least likely to be
//! noticed — a mis-encoded query string just returns no lyrics.

mod support;

use shiranami_integrations::lyrics::{LrclibClient, LrclibOutcome, LrclibQuery};
use shiranami_net::HttpClient;
use support::request::{request_body, request_line};
use support::test_server::{Reply, TestServer};

/// A query for "Song" by "Artist", whose search variants are exactly
/// `["Song Artist", "Song"]` — so a full chain is one `/get` and two
/// `/search` requests.
fn query() -> LrclibQuery {
    LrclibQuery {
        title: "Song".to_owned(),
        artist: "Artist".to_owned(),
        ..LrclibQuery::default()
    }
}

fn client(server: &TestServer) -> LrclibClient {
    LrclibClient::with_base(
        HttpClient::new().expect("the shared client builds"),
        server.url(""),
    )
}

fn record(synced: Option<&str>, plain: Option<&str>) -> String {
    serde_json::json!({
        "id": 1,
        "trackName": "Song",
        "instrumental": false,
        "syncedLyrics": synced,
        "plainLyrics": plain,
    })
    .to_string()
}

#[tokio::test]
async fn an_exact_match_is_returned_without_a_search() {
    let server =
        TestServer::start(vec![Reply::ok(&record(Some("[00:01.00]Hi"), Some("Hi")))]).await;

    let outcome = client(&server).lookup(&query()).await.expect("a lookup");

    let LrclibOutcome::Found(found) = outcome else {
        panic!("expected a hit, got {outcome:?}");
    };
    assert_eq!(found.result.synced.as_ref().map(Vec::len), Some(1));
    assert_eq!(found.result.plain.as_deref(), Some("Hi"));

    assert_eq!(server.received(), 1, "a hit must not also run the searches");
    assert_eq!(
        request_line(&server.requests()[0]),
        "GET /get?track_name=Song&artist_name=Artist HTTP/1.1"
    );
}

/// Parameter order, omission of the empty album, and seconds-not-milliseconds
/// — the three things the `lrclib-api` wire shape fixes.
#[tokio::test]
async fn the_optional_parameters_land_in_the_ported_order() {
    let server = TestServer::start(vec![Reply::ok(&record(None, Some("Hi")))]).await;

    let outcome = client(&server)
        .lookup(&LrclibQuery {
            title: "Song".to_owned(),
            artist: "Artist".to_owned(),
            album: Some("Album".to_owned()),
            duration_seconds: Some(245.6),
        })
        .await
        .expect("a lookup");

    assert!(matches!(outcome, LrclibOutcome::Found(_)));
    assert_eq!(
        request_line(&server.requests()[0]),
        "GET /get?track_name=Song&artist_name=Artist&album_name=Album&duration=245.6 HTTP/1.1"
    );
}

/// The placeholder album narrows the search to records literally called
/// "Unknown Album", so v1 dropped it. So does this.
#[tokio::test]
async fn the_placeholder_album_is_not_sent() {
    let server = TestServer::start(vec![Reply::ok(&record(None, Some("Hi")))]).await;

    client(&server)
        .lookup(&LrclibQuery {
            album: Some(shiranami_core::constants::UNKNOWN_ALBUM.to_owned()),
            ..query()
        })
        .await
        .expect("a lookup");

    let requests = server.requests();
    let line = request_line(&requests[0]);
    assert!(!line.contains("album_name"), "line was {line}");
}

#[tokio::test]
async fn a_zero_duration_is_not_sent() {
    let server = TestServer::start(vec![Reply::ok(&record(None, Some("Hi")))]).await;

    client(&server)
        .lookup(&LrclibQuery {
            duration_seconds: Some(0.0),
            ..query()
        })
        .await
        .expect("a lookup");

    assert!(!request_line(&server.requests()[0]).contains("duration"));
}

/// A space is `%20`, not `+`: these URLs were built with `encodeURIComponent`,
/// not `URLSearchParams`. The weather client next door is the other way round.
#[tokio::test]
async fn query_values_are_encodeuricomponent_escaped() {
    let server = TestServer::start(vec![Reply::ok(&record(None, Some("Hi")))]).await;

    client(&server)
        .lookup(&LrclibQuery {
            title: "Song & Dance".to_owned(),
            artist: "Sigur Rós".to_owned(),
            ..LrclibQuery::default()
        })
        .await
        .expect("a lookup");

    assert_eq!(
        request_line(&server.requests()[0]),
        "GET /get?track_name=Song%20%26%20Dance&artist_name=Sigur%20R%C3%B3s HTTP/1.1"
    );
}

#[tokio::test]
async fn a_404_falls_through_to_the_search_endpoint() {
    let server = TestServer::start(vec![
        Reply::failing(404, "{}"),
        Reply::ok(&format!("[{}]", record(Some("[00:02.00]Found"), None))),
    ])
    .await;

    let outcome = client(&server).lookup(&query()).await.expect("a lookup");

    assert!(matches!(outcome, LrclibOutcome::Found(_)));
    assert_eq!(server.received(), 2);
    assert_eq!(
        request_line(&server.requests()[1]),
        "GET /search?q=Song%20Artist HTTP/1.1"
    );
}

/// A record with neither lyric field is the same as no record — v1 fell through
/// to search on `!syncedLyrics && !plainLyrics`.
#[tokio::test]
async fn a_record_with_no_lyrics_falls_through_to_the_search_endpoint() {
    let server = TestServer::start(vec![
        Reply::ok(&record(None, None)),
        Reply::ok(&format!("[{}]", record(None, Some("Found")))),
    ])
    .await;

    let outcome = client(&server).lookup(&query()).await.expect("a lookup");

    let LrclibOutcome::Found(found) = outcome else {
        panic!("expected a hit, got {outcome:?}");
    };
    assert_eq!(found.result.plain.as_deref(), Some("Found"));
}

/// The variants are tried in order until one answers, and no further.
#[tokio::test]
async fn the_search_variants_are_tried_in_order() {
    let server = TestServer::start(vec![
        Reply::failing(404, "{}"),
        Reply::ok("[]"),
        Reply::ok(&format!("[{}]", record(None, Some("Second variant")))),
    ])
    .await;

    let outcome = client(&server).lookup(&query()).await.expect("a lookup");

    assert!(matches!(outcome, LrclibOutcome::Found(_)));
    assert_eq!(server.received(), 3);
    assert_eq!(
        request_line(&server.requests()[2]),
        "GET /search?q=Song HTTP/1.1"
    );
}

/// v1 took `searchResults[0]` unconditionally rather than the first result
/// *with* lyrics, so a hit carrying nothing still ends the chain.
#[tokio::test]
async fn the_first_search_result_wins_even_when_it_carries_no_lyrics() {
    let body = format!("[{},{}]", record(None, None), record(None, Some("Second")));
    let server = TestServer::start(vec![Reply::failing(404, "{}"), Reply::ok(&body)]).await;

    let outcome = client(&server).lookup(&query()).await.expect("a lookup");

    let LrclibOutcome::Found(found) = outcome else {
        panic!("expected a hit, got {outcome:?}");
    };
    assert_eq!(
        found.result.plain, None,
        "the *first* result won, empty as it was"
    );
    assert_eq!(server.received(), 2, "the chain stopped at the first hit");
}

/// A 404 means the directory does not have the track. Combined with empty
/// searches that is a genuine, cacheable miss — not a failure.
#[tokio::test]
async fn a_404_and_empty_searches_is_a_miss_not_a_failure() {
    let server = TestServer::start(vec![
        Reply::failing(404, "{}"),
        Reply::ok("[]"),
        Reply::ok("[]"),
    ])
    .await;

    let outcome = client(&server).lookup(&query()).await.expect("a lookup");

    assert_eq!(outcome, LrclibOutcome::Missing);
    assert_eq!(server.received(), 3);
}

/// **The deviation from v1.** Every step rate-limited produces a failure, not a
/// miss. v1 swallowed each error and returned the cacheable empty result, so
/// the track was recorded as having no lyrics for the rest of the session.
#[tokio::test]
async fn a_rate_limited_chain_is_a_failure_not_a_miss() {
    let server = TestServer::start(vec![
        Reply::failing(429, ""),
        Reply::failing(429, ""),
        Reply::failing(429, ""),
    ])
    .await;

    let failure = client(&server)
        .lookup(&query())
        .await
        .expect_err("a rate-limited chain must not read as a miss");

    assert_eq!(failure.status(), Some(429));
    assert!(failure.is_rate_limited());
}

/// A failure early in the chain is not forgotten because a later variant
/// returned a clean empty list.
#[tokio::test]
async fn a_failure_anywhere_outranks_a_later_empty_result() {
    let server = TestServer::start(vec![
        Reply::failing(500, ""),
        Reply::ok("[]"),
        Reply::ok("[]"),
    ])
    .await;

    let failure = client(&server)
        .lookup(&query())
        .await
        .expect_err("a failure");

    assert_eq!(failure.status(), Some(500));
    assert!(!failure.is_rate_limited());
}

/// …but a failure does *not* outrank an actual hit: the chain keeps going and
/// a later variant can still win.
#[tokio::test]
async fn a_hit_after_a_failure_still_wins() {
    let server = TestServer::start(vec![
        Reply::failing(500, ""),
        Reply::ok("[]"),
        Reply::ok(&format!("[{}]", record(None, Some("Recovered")))),
    ])
    .await;

    let outcome = client(&server).lookup(&query()).await.expect("a lookup");

    let LrclibOutcome::Found(found) = outcome else {
        panic!("expected a hit, got {outcome:?}");
    };
    assert_eq!(found.result.plain.as_deref(), Some("Recovered"));
}

/// An unparseable body is a failure, not a miss — the same reasoning as a 500.
#[tokio::test]
async fn a_malformed_body_is_a_failure() {
    let server = TestServer::start(vec![
        Reply::ok("not json at all"),
        Reply::ok("also not json"),
        Reply::ok("still not json"),
    ])
    .await;

    let failure = client(&server)
        .lookup(&query())
        .await
        .expect_err("a failure");
    assert_eq!(failure.status(), None, "a parse failure got no status");
}

/// The requests carry no body and no stray headers of their own — they are
/// plain GETs, which is what the endpoint expects.
#[tokio::test]
async fn the_lookup_issues_plain_gets() {
    let server = TestServer::start(vec![Reply::ok(&record(None, Some("Hi")))]).await;

    client(&server).lookup(&query()).await.expect("a lookup");

    let raw = &server.requests()[0];
    assert!(request_line(raw).starts_with("GET "));
    assert_eq!(request_body(raw), "");
    assert!(
        raw.to_lowercase().contains("user-agent: shiranami/"),
        "the shared client's User-Agent is what identifies us"
    );
}
