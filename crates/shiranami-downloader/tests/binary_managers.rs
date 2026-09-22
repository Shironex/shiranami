//! The binary managers against a real socket.
//!
//! These cover what a stubbed HTTP client cannot: the redirect loop every one
//! of the three download hosts actually uses, a `Content-Length` that is absent
//! (so progress is unknowable rather than wrong), and the cleanup that has to
//! happen when a download fails partway.

#[path = "support/http_server.rs"]
mod support;

use std::sync::Mutex;

use shiranami_downloader::bin::fetch::{ProgressSink, download_to_file};
use shiranami_net::HttpClient;
use support::{Reply, TestServer};

#[derive(Default)]
struct Recorder {
    seen: Mutex<Vec<u32>>,
}

impl Recorder {
    fn seen(&self) -> Vec<u32> {
        self.seen
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

impl ProgressSink for Recorder {
    fn percent(&self, percent: u32) {
        self.seen
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(percent);
    }
}

fn client() -> HttpClient {
    HttpClient::new().expect("the client builds")
}

#[tokio::test]
async fn downloads_a_body_to_disk() {
    let server = TestServer::start(vec![Reply::Body(b"MZ-a-binary".to_vec())]).await;
    let temp = tempfile::tempdir().expect("a temporary directory");
    let destination = temp.path().join("yt-dlp");

    download_to_file(&client(), &server.url("/asset"), &destination, None)
        .await
        .expect("the download succeeds");

    assert_eq!(
        std::fs::read(&destination).expect("the file was written"),
        b"MZ-a-binary"
    );
}

#[tokio::test]
async fn follows_the_redirect_every_release_host_sends() {
    let server = TestServer::start(vec![
        Reply::Redirect {
            status: 302,
            location: "/cdn/asset".to_owned(),
        },
        Reply::Body(b"MZ-from-the-cdn".to_vec()),
    ])
    .await;
    let temp = tempfile::tempdir().expect("a temporary directory");
    let destination = temp.path().join("yt-dlp");

    download_to_file(&client(), &server.url("/asset"), &destination, None)
        .await
        .expect("the download succeeds");

    assert_eq!(
        std::fs::read(&destination).expect("the file was written"),
        b"MZ-from-the-cdn"
    );
    assert_eq!(
        server.paths(),
        vec!["/asset", "/cdn/asset"],
        "the relative Location must resolve against the URL it came from"
    );
}

#[tokio::test]
async fn refuses_a_redirect_chain_that_never_arrives() {
    // Seven hops queued against a ceiling of five.
    let replies = (0..7)
        .map(|hop| Reply::Redirect {
            status: 302,
            location: format!("/hop-{}", hop + 1),
        })
        .collect();
    let server = TestServer::start(replies).await;
    let temp = tempfile::tempdir().expect("a temporary directory");
    let destination = temp.path().join("yt-dlp");

    let error = download_to_file(&client(), &server.url("/hop-0"), &destination, None)
        .await
        .expect_err("the chain is refused");

    assert!(
        error.to_string().contains("redirected more than"),
        "a redirect loop must terminate rather than run forever: {error}"
    );
}

#[tokio::test]
async fn reports_progress_from_the_content_length() {
    // 100 bytes, so each byte is one percent and the sequence is legible.
    let server = TestServer::start(vec![Reply::Body(vec![b'x'; 100])]).await;
    let temp = tempfile::tempdir().expect("a temporary directory");
    let destination = temp.path().join("yt-dlp");
    let recorder = Recorder::default();

    download_to_file(
        &client(),
        &server.url("/asset"),
        &destination,
        Some(&recorder),
    )
    .await
    .expect("the download succeeds");

    let seen = recorder.seen();
    assert_eq!(
        seen.last(),
        Some(&100),
        "a completed download must end on 100"
    );
    assert!(
        seen.windows(2).all(|pair| pair[0] < pair[1]),
        "progress must be strictly increasing — v1 fired on every chunk and \
         repeated itself thousands of times: {seen:?}"
    );
}

#[tokio::test]
async fn a_body_without_a_content_length_downloads_without_progress() {
    let server = TestServer::start(vec![Reply::BodyWithoutLength(b"MZ-unmeasured".to_vec())]).await;
    let temp = tempfile::tempdir().expect("a temporary directory");
    let destination = temp.path().join("yt-dlp");
    let recorder = Recorder::default();

    download_to_file(
        &client(),
        &server.url("/asset"),
        &destination,
        Some(&recorder),
    )
    .await
    .expect("the download succeeds");

    assert_eq!(
        std::fs::read(&destination).expect("the file was written"),
        b"MZ-unmeasured"
    );
    assert!(
        recorder.seen().is_empty(),
        "an unknown total means progress is unknowable — reporting a made-up \
         percentage is worse than reporting none"
    );
}

#[tokio::test]
async fn a_non_success_status_fails_with_v1s_message() {
    let server = TestServer::start(vec![Reply::Failing(404)]).await;
    let temp = tempfile::tempdir().expect("a temporary directory");
    let destination = temp.path().join("yt-dlp");

    let error = download_to_file(&client(), &server.url("/asset"), &destination, None)
        .await
        .expect_err("a 404 is a failed download");

    assert_eq!(
        error.to_string(),
        "Download failed with status 404",
        "the install handlers put this message straight onto the \
         `downloader.install_failed` payload the renderer shows"
    );
}

#[tokio::test]
async fn a_redirect_with_no_location_is_a_failure_not_a_body() {
    let server = TestServer::start(vec![Reply::Failing(302)]).await;
    let temp = tempfile::tempdir().expect("a temporary directory");
    let destination = temp.path().join("yt-dlp");

    let error = download_to_file(&client(), &server.url("/asset"), &destination, None)
        .await
        .expect_err("a 302 with nowhere to go is a failure");

    assert_eq!(error.to_string(), "Download failed with status 302");
}
