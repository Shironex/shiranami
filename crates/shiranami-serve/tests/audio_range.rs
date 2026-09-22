//! The Range matrix, over real HTTP against a real bind.
//!
//! WebKit opens every media load with `Range: bytes=0-1` and expects a 206 with
//! `Content-Range` and `Accept-Ranges` (`docs/v2/spike-a-results.md` §3). Range
//! is therefore not a seeking feature to be exercised on a seek test — it is the
//! first request of every playback, and these assertions are what stands between
//! the app and a player that never starts.
//!
//! `crate::range`'s unit tests already cover the parser exhaustively. What is
//! tested here is the part a pure function cannot see: that the parsed range
//! reaches the wire as the right status, the right headers, and the right bytes.

mod common;

use common::{Harness, pattern};
use reqwest::StatusCode;
use reqwest::header::{ACCEPT_RANGES, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE};

const SIZE: usize = 4_096;

/// The header value, or a message naming the header that was missing.
fn header(response: &reqwest::Response, name: reqwest::header::HeaderName) -> String {
    response
        .headers()
        .get(&name)
        .unwrap_or_else(|| panic!("the response carries no {name}"))
        .to_str()
        .expect("the header is readable")
        .to_owned()
}

/// The probe every single media load starts with. If this fails, nothing plays.
#[tokio::test]
async fn the_webkit_two_byte_probe_is_answered_with_a_206() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", SIZE);

    let response = harness.audio(&path, &[("Range", "bytes=0-1")]).await;

    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(
        header(&response, CONTENT_RANGE),
        format!("bytes 0-1/{SIZE}")
    );
    assert_eq!(header(&response, CONTENT_LENGTH), "2");
    assert_eq!(header(&response, ACCEPT_RANGES), "bytes");
    assert_eq!(header(&response, CONTENT_TYPE), "audio/mpeg");

    let body = response.bytes().await.expect("a body");
    assert_eq!(&body[..], &pattern(SIZE)[0..=1]);
}

/// The request WebKit sends straight after the probe.
#[tokio::test]
async fn the_full_span_request_is_a_206_not_a_200() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", SIZE);

    let response = harness
        .audio(&path, &[("Range", &format!("bytes=0-{}", SIZE - 1))])
        .await;

    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(
        header(&response, CONTENT_RANGE),
        format!("bytes 0-{}/{SIZE}", SIZE - 1)
    );
    assert_eq!(response.bytes().await.expect("a body").len(), SIZE);
}

#[tokio::test]
async fn no_range_header_is_a_200_that_still_advertises_ranges() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.flac", SIZE);

    let response = harness.audio(&path, &[]).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(header(&response, CONTENT_LENGTH), SIZE.to_string());
    assert_eq!(
        header(&response, ACCEPT_RANGES),
        "bytes",
        "a client learns it may seek from the 200, before it ever sends a Range"
    );
    assert_eq!(header(&response, CONTENT_TYPE), "audio/flac");
    assert_eq!(
        response.bytes().await.expect("a body")[..],
        pattern(SIZE)[..]
    );
}

/// The satisfiable shapes, each checked for status, headers and actual bytes.
#[tokio::test]
async fn the_satisfiable_range_matrix_returns_the_right_bytes() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", SIZE);
    let contents = pattern(SIZE);

    // (header, expected first byte, expected last byte)
    let cases: [(String, usize, usize); 9] = [
        ("bytes=0-1".to_owned(), 0, 1),
        ("bytes=0-0".to_owned(), 0, 0),
        ("bytes=100-199".to_owned(), 100, 199),
        ("bytes=2048-".to_owned(), 2_048, SIZE - 1),
        ("bytes=-512".to_owned(), SIZE - 512, SIZE - 1),
        ("bytes=-1".to_owned(), SIZE - 1, SIZE - 1),
        // A suffix longer than the file is the whole file.
        ("bytes=-99999".to_owned(), 0, SIZE - 1),
        // An end past the file is clamped; v1 sent an over-long Content-Range.
        ("bytes=0-999999".to_owned(), 0, SIZE - 1),
        // Multi-range is answered with the first satisfiable range, never
        // multipart/byteranges.
        ("bytes=100-199,300-399".to_owned(), 100, 199),
    ];

    for (value, start, end) in cases {
        let response = harness.audio(&path, &[("Range", &value)]).await;

        assert_eq!(
            response.status(),
            StatusCode::PARTIAL_CONTENT,
            "`{value}` should be a 206"
        );
        assert_eq!(
            header(&response, CONTENT_RANGE),
            format!("bytes {start}-{end}/{SIZE}"),
            "`{value}` reported the wrong extent"
        );
        assert_eq!(
            header(&response, CONTENT_LENGTH),
            (end - start + 1).to_string(),
            "`{value}` reported the wrong length"
        );

        let body = response.bytes().await.expect("a body");
        assert_eq!(
            &body[..],
            &contents[start..=end],
            "`{value}` returned the wrong bytes"
        );
    }
}

/// A range that is understood and cannot be met. 416, with the length the
/// client needs in order to ask again.
#[tokio::test]
async fn unsatisfiable_ranges_are_416_with_the_entity_length() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", SIZE);

    for value in [
        "bytes=4096-",
        "bytes=4096-5000",
        "bytes=99999-",
        // Understood, and asks for nothing.
        "bytes=-0",
        // Every range in the set is past the end.
        "bytes=5000-6000,7000-",
    ] {
        let response = harness.audio(&path, &[("Range", value)]).await;

        assert_eq!(
            response.status(),
            StatusCode::RANGE_NOT_SATISFIABLE,
            "`{value}` should be a 416"
        );
        assert_eq!(
            header(&response, CONTENT_RANGE),
            format!("bytes */{SIZE}"),
            "`{value}` must report the real length so the client can recover"
        );
    }
}

/// A header the server cannot parse is ignored, not refused (RFC 7233 §3.1).
/// A 416 here would be a lie, and WebKit treats it as a hard media error.
#[tokio::test]
async fn malformed_ranges_fall_back_to_the_whole_file() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", SIZE);

    for value in [
        "bytes=",
        "bytes=-",
        "bytes=abc",
        "bytes=abc-def",
        "bytes=0-abc",
        "bytes=5-2",
        "bytes=1-2-3",
        "bytes=+0-+1",
        "bytes=0-99999999999999999999999",
        // A valid range spoiled by an invalid sibling invalidates the set.
        "bytes=0-1,nonsense",
        // Units we do not implement.
        "items=0-1",
        "seconds=0-10",
    ] {
        let response = harness.audio(&path, &[("Range", value)]).await;

        assert_eq!(
            response.status(),
            StatusCode::OK,
            "`{value}` must be ignored, yielding the whole file"
        );
        assert_eq!(
            response.bytes().await.expect("a body").len(),
            SIZE,
            "`{value}` returned a partial body under a 200"
        );
    }
}

#[tokio::test]
async fn the_range_unit_is_matched_case_insensitively() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", SIZE);

    for value in ["BYTES=0-1", "Bytes=0-1", "bytes = 0-1"] {
        let response = harness.audio(&path, &[("Range", value)]).await;
        assert_eq!(
            response.status(),
            StatusCode::PARTIAL_CONTENT,
            "`{value}` should be a 206"
        );
    }
}

/// An empty file has no satisfiable byte position — and the arithmetic saying so
/// must not underflow.
#[tokio::test]
async fn an_empty_file_is_a_200_without_a_range_and_a_416_with_one() {
    let harness = Harness::start().await;
    let path = harness.write_audio("silence.mp3", 0);

    let full = harness.audio(&path, &[]).await;
    assert_eq!(full.status(), StatusCode::OK);
    assert_eq!(header(&full, CONTENT_LENGTH), "0");

    let probed = harness.audio(&path, &[("Range", "bytes=0-1")]).await;
    assert_eq!(probed.status(), StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(header(&probed, CONTENT_RANGE), "bytes */0");
}

/// A one-byte file must answer the two-byte probe by clamping, not refusing.
#[tokio::test]
async fn a_one_byte_file_answers_the_probe_by_clamping() {
    let harness = Harness::start().await;
    let path = harness.write_audio("tiny.mp3", 1);

    let response = harness.audio(&path, &[("Range", "bytes=0-1")]).await;

    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(header(&response, CONTENT_RANGE), "bytes 0-0/1");
    assert_eq!(response.bytes().await.expect("a body").len(), 1);
}

/// Every extension in the allowlist plays, and carries the content type WebKit
/// dispatches its decoder on.
#[tokio::test]
async fn every_allowed_extension_is_served_with_its_own_content_type() {
    let harness = Harness::start().await;

    for (name, expected) in [
        ("a.mp3", "audio/mpeg"),
        ("a.flac", "audio/flac"),
        ("a.wav", "audio/wav"),
        ("a.ogg", "audio/ogg"),
        ("a.aac", "audio/aac"),
        ("a.m4a", "audio/mp4"),
        ("a.opus", "audio/opus"),
        ("a.wma", "audio/x-ms-wma"),
        ("a.weba", "audio/webm"),
        ("a.webm", "audio/webm"),
    ] {
        let path = harness.write_audio(name, 32);
        let response = harness.audio(&path, &[]).await;

        assert_eq!(response.status(), StatusCode::OK, "{name} was refused");
        assert_eq!(header(&response, CONTENT_TYPE), expected, "{name}");
    }
}

/// A path with a space in it survives the round trip. v1 read the parameter with
/// `URLSearchParams`, so `+` means space; a percent-decoding reader would resolve
/// a different file for every track whose name has a space in it.
#[tokio::test]
async fn a_path_with_spaces_and_pluses_resolves_to_the_right_file() {
    let harness = Harness::start().await;

    for name in ["Track Two.mp3", "Track+Remix.mp3", "Ünïcode & Symbols.mp3"] {
        let path = harness.write_audio(name, 64);
        let response = harness.audio(&path, &[]).await;

        assert_eq!(response.status(), StatusCode::OK, "{name} did not resolve");
        assert_eq!(response.bytes().await.expect("a body").len(), 64);
    }
}

/// A large file is streamed, not buffered. The proof over HTTP is that the first
/// bytes arrive before the last ones are read; the chunk-size bound itself is
/// asserted in `routes::audio`'s unit test, which can see the reader.
#[tokio::test]
async fn a_large_file_streams_rather_than_buffering() {
    let harness = Harness::start().await;
    let size = 8 * 1024 * 1024;
    let path = harness.write_audio("long.flac", size);

    let mut response = harness.audio(&path, &[]).await;
    assert_eq!(response.status(), StatusCode::OK);

    let mut chunks = 0_usize;
    let mut received = 0_usize;
    while let Some(chunk) = response.chunk().await.expect("the stream continues") {
        received += chunk.len();
        chunks += 1;
    }

    assert_eq!(received, size);
    assert!(
        chunks > 1,
        "an 8 MB body arrived as one chunk — the file was read into memory first"
    );
}

#[tokio::test]
async fn a_head_request_carries_the_headers_without_the_body() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", SIZE);
    let url = format!(
        "{}/audio?path={}",
        harness.base(),
        common::encode(&path.to_string_lossy())
    );

    let response = harness
        .client
        .head(&url)
        .send()
        .await
        .expect("the request reaches the server");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(header(&response, CONTENT_LENGTH), SIZE.to_string());
    assert_eq!(header(&response, ACCEPT_RANGES), "bytes");
    assert!(response.bytes().await.expect("a body").is_empty());
}
