//! The album-art route and its cache, over HTTP.
//!
//! Art is content-addressed — the name is a hash of the bytes — which is what
//! makes `immutable` an honest cache header here and what makes an in-memory LRU
//! safe: the file behind a name cannot change, so a stale hit is impossible by
//! construction.

mod common;

use common::{Harness, pattern};
use reqwest::StatusCode;
use reqwest::header::{CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE};

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
async fn a_cover_is_served_with_its_bytes_and_length() {
    let harness = Harness::start().await;
    harness.write_art("6f1ed002ab5595859014ebf0951522d9.jpg", 2_048);

    let response = harness.art("6f1ed002ab5595859014ebf0951522d9.jpg").await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(header(&response, CONTENT_TYPE), "image/jpeg");
    assert_eq!(header(&response, CONTENT_LENGTH), "2048");
    assert_eq!(
        response.bytes().await.expect("a body")[..],
        pattern(2_048)[..]
    );
}

/// Sound only because the name is a hash of the contents. On the audio route the
/// same header would be a bug — a retagged file keeps its path.
#[tokio::test]
async fn a_cover_is_cached_forever_and_immutably() {
    let harness = Harness::start().await;
    harness.write_art("cover.jpg", 128);

    let value = header(&harness.art("cover.jpg").await, CACHE_CONTROL);

    assert!(value.contains("immutable"), "{value}");
    assert!(value.contains("max-age=31536000"), "{value}");
    assert!(value.contains("public"), "{value}");
}

#[tokio::test]
async fn every_image_extension_is_served_with_its_own_content_type() {
    let harness = Harness::start().await;

    for (name, expected) in [
        ("a.jpg", "image/jpeg"),
        ("a.jpeg", "image/jpeg"),
        ("a.png", "image/png"),
        ("a.webp", "image/webp"),
        ("a.gif", "image/gif"),
        ("a.bmp", "image/bmp"),
    ] {
        harness.write_art(name, 64);
        let response = harness.art(name).await;

        assert_eq!(response.status(), StatusCode::OK, "{name} was refused");
        assert_eq!(header(&response, CONTENT_TYPE), expected, "{name}");
    }
}

/// The cache is a cache: the second request is served from memory. Deleting the
/// file between the two requests is how the test can tell — a miss would 404.
#[tokio::test]
async fn a_second_request_is_served_from_the_cache() {
    let harness = Harness::start().await;
    let path = harness.write_art("cover.jpg", 1_024);

    let first = harness.art("cover.jpg").await;
    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(first.bytes().await.expect("a body")[..], pattern(1_024)[..]);

    std::fs::remove_file(&path).expect("the fixture is removed");

    let second = harness.art("cover.jpg").await;
    assert_eq!(
        second.status(),
        StatusCode::OK,
        "the second request went to disk, so nothing was cached"
    );
    assert_eq!(
        second.bytes().await.expect("a body")[..],
        pattern(1_024)[..]
    );
}

#[tokio::test]
async fn a_missing_cover_is_a_404() {
    let harness = Harness::start().await;

    let response = harness.art("never-written.jpg").await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(response.text().await.expect("a body"), "Not found");
}

#[tokio::test]
async fn a_directory_in_the_art_dir_is_not_a_file() {
    let harness = Harness::start().await;
    std::fs::create_dir(harness.art.path().join("album.jpg")).expect("the directory is created");

    let response = harness.art("album.jpg").await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(response.text().await.expect("a body"), "Not a file");
}

/// A file past the cache budget is served without being held, so one oversized
/// cover cannot flush every useful entry or pin five megabytes in memory.
#[tokio::test]
async fn an_oversized_cover_is_streamed_rather_than_cached() {
    let harness = Harness::start().await;
    let size = 6 * 1024 * 1024;
    let path = harness.write_art("huge.jpg", size);

    let first = harness.art("huge.jpg").await;
    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(first.bytes().await.expect("a body").len(), size);

    std::fs::remove_file(&path).expect("the fixture is removed");

    assert_eq!(
        harness.art("huge.jpg").await.status(),
        StatusCode::NOT_FOUND,
        "an oversized cover was admitted to the cache"
    );
}

/// The art route answers no Range requests: v1 declared the scheme with
/// `stream: false` and nothing asks a cover for a byte range.
#[tokio::test]
async fn art_does_not_advertise_range_support() {
    let harness = Harness::start().await;
    harness.write_art("cover.jpg", 512);

    let response = harness.art("cover.jpg").await;

    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        response
            .headers()
            .get(reqwest::header::ACCEPT_RANGES)
            .is_none()
    );
}

/// A Range header on the art route is answered with the whole image rather than
/// a 206 with no `Content-Range` — the shape that would leave an `<img>` holding
/// a fragment it cannot place.
#[tokio::test]
async fn a_range_request_for_art_returns_the_whole_image() {
    let harness = Harness::start().await;
    harness.write_art("cover.jpg", 512);
    let url = format!("{}/art/cover.jpg", harness.base());

    let response = harness.get(&url, &[("Range", "bytes=0-1")]).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.bytes().await.expect("a body").len(), 512);
}
