//! Audio downloads: whole file, ranged resume, `If-Range`, containment.

// Test code: a failed unwrap is a failed test, with the location in the panic.
#![allow(clippy::unwrap_used)]

mod common;

use common::Harness;

fn fixture(len: usize) -> Vec<u8> {
    (0..len).map(|i| (i % 251) as u8).collect()
}

#[tokio::test(flavor = "multi_thread")]
async fn a_download_resumes_with_range_and_if_range() {
    let harness = Harness::start().await;
    let bytes = fixture(300_000);
    harness.add_track("song", "song.flac", &bytes, "").await;
    let phone = harness.paired_phone().await;
    let path = "/v1/sync/tracks/song/audio";

    let whole = phone.get(path).await;
    assert_eq!(whole.status, 200);
    assert_eq!(whole.body, bytes);
    assert_eq!(whole.headers["accept-ranges"], "bytes");
    assert_eq!(whole.headers["content-type"], "audio/flac");
    let etag = whole.headers["etag"].to_str().unwrap().to_owned();

    // The phone gets 100 000 bytes in, then the Wi-Fi drops.
    let first = phone.get_with(path, &[("range", "bytes=0-99999")]).await;
    assert_eq!(first.status, 206);
    assert_eq!(first.body.len(), 100_000);
    assert_eq!(first.headers["content-range"], "bytes 0-99999/300000");

    // Resume from the partial file's size, guarded by the ETag.
    let rest = phone
        .get_with(path, &[("range", "bytes=100000-"), ("if-range", &etag)])
        .await;
    assert_eq!(rest.status, 206);
    assert_eq!(rest.headers["content-range"], "bytes 100000-299999/300000");
    let mut joined = first.body.clone();
    joined.extend_from_slice(&rest.body);
    assert_eq!(joined, bytes, "the resumed file is byte-identical");

    // The file changed on the desktop: the old ETag no longer matches, so the
    // whole new file comes back instead of a corrupt splice.
    let stale = phone
        .get_with(path, &[("range", "bytes=100000-"), ("if-range", "\"1-1\"")])
        .await;
    assert_eq!(stale.status, 200);
    assert_eq!(stale.body.len(), 300_000);

    let beyond = phone.get_with(path, &[("range", "bytes=400000-")]).await;
    assert_eq!(beyond.status, 416);
    assert_eq!(beyond.headers["content-range"], "bytes */300000");
}

#[tokio::test(flavor = "multi_thread")]
async fn tracks_outside_the_library_or_not_audio_are_404() {
    let harness = Harness::start().await;
    let outside = harness.outside.path().join("secret.mp3");
    std::fs::write(&outside, b"not yours").unwrap();
    harness.insert_track("escape", &outside, "").await;
    harness.add_track("text", "notes.txt", b"hello", "").await;
    let phone = harness.paired_phone().await;

    assert_eq!(phone.get("/v1/sync/tracks/escape/audio").await.status, 404);
    assert_eq!(phone.get("/v1/sync/tracks/text/audio").await.status, 404);
    assert_eq!(phone.get("/v1/sync/tracks/nope/audio").await.status, 404);
}

#[tokio::test(flavor = "multi_thread")]
async fn finished_transfers_leave_the_status() {
    let harness = Harness::start().await;
    harness
        .add_track("song", "song.mp3", &fixture(1000), "")
        .await;
    let phone = harness.paired_phone().await;
    assert_eq!(phone.get("/v1/sync/tracks/song/audio").await.status, 200);
    // The body is fully read, so its guard has dropped.
    for _ in 0..100 {
        if harness.server.status().transfers.is_empty() {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("the transfer never left the status");
}
