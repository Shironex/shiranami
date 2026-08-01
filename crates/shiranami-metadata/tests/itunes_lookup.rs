//! The iTunes lookup, against a real loopback socket.
//!
//! v1's suite never exercised `searchItunes` at all — it tested only the title
//! cleaner, leaving the URL construction, the ranking, the artwork rewrite and
//! the error handling uncovered. Those are the parts that decide what a user's
//! library ends up tagged with, so they get real coverage here.

#![allow(
    dead_code,
    reason = "the shared helper carries more than one test needs"
)]

#[path = "support/test_server.rs"]
mod test_server;

use shiranami_metadata::MetadataError;
use shiranami_metadata::lookup::itunes::search_at;
use shiranami_metadata::lookup::{LookupSource, MIN_CONFIDENCE};
use shiranami_net::HttpClient;
use test_server::{Reply, TestServer};

fn client() -> HttpClient {
    HttpClient::new().expect("the shared client builds")
}

/// One iTunes result, as the API shapes it.
fn result(title: &str, artist: &str) -> String {
    format!(
        r#"{{
          "trackName": "{title}",
          "artistName": "{artist}",
          "collectionName": "THE BOOK",
          "primaryGenreName": "J-Pop",
          "releaseDate": "2020-07-01T07:00:00Z",
          "trackNumber": 3,
          "artworkUrl100": "https://is1.mzstatic.com/image/100x100bb.jpg"
        }}"#
    )
}

fn response(results: &[String]) -> String {
    format!(
        r#"{{"resultCount":{},"results":[{}]}}"#,
        results.len(),
        results.join(",")
    )
}

#[tokio::test]
async fn a_match_is_projected_onto_the_lookup_result() {
    let server = TestServer::start(vec![Reply::ok(&response(&[result(
        "Racing Into The Night",
        "YOASOBI",
    )]))])
    .await;

    let found = search_at(
        &client(),
        "Racing Into The Night",
        "YOASOBI",
        &server.url("/search"),
    )
    .await
    .expect("a 200 with results resolves");

    assert_eq!(found.source, LookupSource::Itunes);
    assert_eq!(found.title.as_deref(), Some("Racing Into The Night"));
    assert_eq!(found.artist.as_deref(), Some("YOASOBI"));
    assert_eq!(found.album.as_deref(), Some("THE BOOK"));
    assert_eq!(found.genre.as_deref(), Some("J-Pop"));
    assert_eq!(found.year, Some(2020));
    assert_eq!(found.track_number, Some(3));
    assert!((found.confidence - 1.0).abs() < f64::EPSILON);
}

#[tokio::test]
async fn the_request_carries_v1s_query_parameters() {
    let server = TestServer::start(vec![Reply::ok(&response(&[]))]).await;

    let _ = search_at(&client(), "Belgium", "Lil Peep", &server.url("/search")).await;

    let request = server.requests().pop().expect("one request was received");
    assert!(request.contains("term=Lil%20Peep%20Belgium"), "{request}");
    assert!(request.contains("media=music"), "{request}");
    assert!(request.contains("entity=song"), "{request}");
    assert!(request.contains("limit=5"), "{request}");
}

#[tokio::test]
async fn the_search_title_is_cleaned_before_it_is_sent() {
    let server = TestServer::start(vec![Reply::ok(&response(&[]))]).await;

    let _ = search_at(
        &client(),
        "Lil Peep - Belgium (Official Video) [HD]",
        "Lil Peep",
        &server.url("/search"),
    )
    .await;

    let request = server.requests().pop().expect("one request was received");
    assert!(
        request.contains("term=Lil%20Peep%20Belgium&"),
        "the noise was not stripped: {request}"
    );
}

#[tokio::test]
async fn the_artwork_url_is_upscaled_to_six_hundred() {
    let server =
        TestServer::start(vec![Reply::ok(&response(&[result("Belgium", "Lil Peep")]))]).await;

    let found = search_at(&client(), "Belgium", "Lil Peep", &server.url("/search"))
        .await
        .expect("a 200 resolves");

    assert_eq!(
        found.cover_image_url.as_deref(),
        Some("https://is1.mzstatic.com/image/600x600bb.jpg")
    );
}

#[tokio::test]
async fn an_empty_result_set_is_no_match() {
    let server = TestServer::start(vec![Reply::ok(&response(&[]))]).await;

    let found = search_at(&client(), "Belgium", "Lil Peep", &server.url("/search"))
        .await
        .expect("an empty result set is not an error");

    assert!(!found.is_match());
    assert_eq!(found.source, LookupSource::None);
}

#[tokio::test]
async fn the_best_scoring_candidate_wins() {
    let server = TestServer::start(vec![Reply::ok(&response(&[
        result("Something Else Entirely", "A Different Band"),
        result("Belgium", "Lil Peep"),
    ]))])
    .await;

    let found = search_at(&client(), "Belgium", "Lil Peep", &server.url("/search"))
        .await
        .expect("a 200 resolves");

    assert_eq!(found.title.as_deref(), Some("Belgium"));
    assert!(found.confidence >= MIN_CONFIDENCE);
}

#[tokio::test]
async fn a_poor_match_still_returns_but_below_the_threshold() {
    // The zero-confidence case: v1 keeps `results[0]` and lets the caller
    // reject it. Confusing "scored zero" with "no result" would silently
    // change which tracks get enriched.
    let server = TestServer::start(vec![Reply::ok(&response(&[result(
        "Totally Unrelated",
        "Nobody",
    )]))])
    .await;

    let found = search_at(&client(), "Belgium", "Lil Peep", &server.url("/search"))
        .await
        .expect("a 200 resolves");

    assert!(found.is_match(), "the candidate is still returned");
    assert!(found.confidence < MIN_CONFIDENCE);
}

#[tokio::test]
async fn a_rate_limit_is_an_error_not_a_miss() {
    // v1 caught every failure and returned `null`, so a 429 was
    // indistinguishable from "no match" — and the renderer then added the
    // track to a *persisted* skip list, permanently marking a rate-limited
    // track unmatchable. Reporting the error is what lets the caller retry.
    let server = TestServer::start(vec![Reply::failing(429, "slow down")]).await;

    let error = search_at(&client(), "Belgium", "Lil Peep", &server.url("/search"))
        .await
        .expect_err("a 429 is an error");

    match error {
        MetadataError::Http(http) => {
            assert!(http.is_rate_limited(), "got {http:?}");
        }
        other => panic!("expected an HTTP error, got {other:?}"),
    }
}

#[tokio::test]
async fn a_server_error_is_reported() {
    let server = TestServer::start(vec![Reply::failing(500, "boom")]).await;

    let error = search_at(&client(), "Belgium", "Lil Peep", &server.url("/search"))
        .await
        .expect_err("a 500 is an error");

    assert!(matches!(error, MetadataError::Http(_)), "got {error:?}");
}

#[tokio::test]
async fn malformed_json_is_reported() {
    let server = TestServer::start(vec![Reply::ok("{ not json")]).await;

    let error = search_at(&client(), "Belgium", "Lil Peep", &server.url("/search"))
        .await
        .expect_err("unparseable JSON is an error");

    assert!(matches!(error, MetadataError::Http(_)), "got {error:?}");
}

#[tokio::test]
async fn a_result_missing_every_optional_field_still_parses() {
    // iTunes omits fields freely, and v1's interface marked them all optional.
    let server = TestServer::start(vec![Reply::ok(r#"{"results":[{}]}"#)]).await;

    let found = search_at(&client(), "Belgium", "Lil Peep", &server.url("/search"))
        .await
        .expect("a sparse result parses");

    assert!(found.is_match());
    assert_eq!(found.title, None);
    assert_eq!(found.artist, None);
    assert_eq!(found.year, None);
    assert_eq!(found.confidence, 0.0);
}

#[tokio::test]
async fn an_unknown_artist_only_scores_the_title() {
    let server =
        TestServer::start(vec![Reply::ok(&response(&[result("Belgium", "Lil Peep")]))]).await;

    let found = search_at(
        &client(),
        "Belgium",
        shiranami_core::UNKNOWN_ARTIST,
        &server.url("/search"),
    )
    .await
    .expect("a 200 resolves");

    assert!(
        (found.confidence - 0.5).abs() < f64::EPSILON,
        "the artist half must be skipped, got {}",
        found.confidence
    );
}
