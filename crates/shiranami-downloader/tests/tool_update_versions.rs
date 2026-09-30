//! An automatic update against an installed tool whose version cannot be read.
//!
//! Beside `tool_updates.rs` rather than inside it, which is at its module cap.

#[path = "support/http_server.rs"]
mod support;

use std::sync::Arc;

use shiranami_core::models::Tool;
use shiranami_downloader::bin::{FfmpegManager, Platform, Tools, YtDlpManager};
use shiranami_downloader::spawn::{
    LineSink, ProcessError, ProcessOutput, ProcessRunner, ProcessSpec,
};
use shiranami_downloader::update::{SwapGate, SwapHold, UpdateOutcome, update_tool};
use tokio_util::sync::CancellationToken;

use support::{Reply, TestServer};

/// A binary that will not run: every `--version` exits non-zero.
struct Broken;

#[async_trait::async_trait]
impl ProcessRunner for Broken {
    async fn run(
        &self,
        _spec: ProcessSpec,
        _lines: Option<&(dyn LineSink + '_)>,
        _cancel: &CancellationToken,
    ) -> Result<ProcessOutput, ProcessError> {
        Ok(ProcessOutput {
            code: 1,
            ..ProcessOutput::default()
        })
    }
}

/// A gate that is always quiet.
struct Open;

#[async_trait::async_trait]
impl SwapGate for Open {
    async fn quiesce(&self) -> Option<SwapHold> {
        Some(SwapHold::noop())
    }
}

/// A binary that will not answer `--version` is not "up to date": the check
/// fails, so the streak counts it, and nothing is downloaded or swapped.
#[tokio::test]
async fn an_unreadable_installed_version_fails_the_check() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let server =
        TestServer::start(vec![Reply::Body(br#"{"tag_name":"2026.09.20"}"#.to_vec())]).await;
    let path = temp.path().join("yt-dlp.exe");
    tokio::fs::write(&path, "broken")
        .await
        .expect("place a broken binary");
    let client = Arc::new(shiranami_net::HttpClient::new().expect("the client builds"));
    let runner: Arc<dyn ProcessRunner> = Arc::new(Broken);
    let bin = temp.path().to_path_buf();
    let tools = Tools::new(
        YtDlpManager::new(
            bin.clone(),
            Platform::Windows,
            Arc::clone(&client),
            Arc::clone(&runner),
        )
        .with_upstream(server.url("/api"), server.url("/releases")),
        FfmpegManager::new(bin, Platform::Windows, client, runner),
    );

    let outcome = update_tool(Tool::Ytdlp, &tools, &Open).await;

    assert!(
        matches!(outcome, UpdateOutcome::Failed(_)),
        "an unreadable version must not read as up to date: {outcome:?}"
    );
    assert_eq!(server.paths(), vec!["/api".to_owned()]);
    assert_eq!(
        tokio::fs::read_to_string(&path).await.expect("read"),
        "broken",
        "nothing is swapped in"
    );
    assert!(!tools.ytdlp.is_installing());
}
