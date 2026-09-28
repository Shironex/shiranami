//! Automatic tool updates end to end, against a real socket: the release API,
//! the asset and its `SHA2-256SUMS`, then the checksum, the swap and the probe.
//!
//! The "binaries" are text files holding their own version, and the process
//! runner answers `--version` by reading them, so a swap is observable as a
//! file's contents changing and a broken binary is an empty file.

#[path = "support/http_server.rs"]
mod support;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use shiranami_core::models::Tool;
use shiranami_downloader::bin::checksum::{self, CHECKSUM_MISMATCH};
use shiranami_downloader::bin::swap::backup_path;
use shiranami_downloader::bin::ytdlp::PROBE_FAILED;
use shiranami_downloader::bin::{FfmpegManager, Platform, Tools, YtDlpManager};
use shiranami_downloader::spawn::{
    LineSink, ProcessError, ProcessOutput, ProcessRunner, ProcessSpec,
};
use shiranami_downloader::update::{SwapGate, UpdateOutcome, update_tool};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

use support::{Reply, TestServer};

const OLD: &str = "2026.01.01";
const NEW: &str = "2026.09.20";

/// A "binary" is a text file holding its own version, and running it with
/// `--version` prints that. An empty file is a binary that will not run.
struct FileVersionRunner;

#[async_trait::async_trait]
impl ProcessRunner for FileVersionRunner {
    async fn run(
        &self,
        spec: ProcessSpec,
        _lines: Option<&(dyn LineSink + '_)>,
        _cancel: &CancellationToken,
    ) -> Result<ProcessOutput, ProcessError> {
        let body = tokio::fs::read_to_string(&spec.program)
            .await
            .unwrap_or_default();
        Ok(ProcessOutput {
            code: if body.trim().is_empty() { 1 } else { 0 },
            stdout: body,
            ..ProcessOutput::default()
        })
    }
}

/// A gate that is always quiet.
struct Open;

#[async_trait::async_trait]
impl SwapGate for Open {
    async fn quiesce(&self) -> bool {
        true
    }
    async fn release(&self) {}
}

/// A gate that stays busy until the test says the downloads finished.
#[derive(Default)]
struct Busy {
    finished: Notify,
}

#[async_trait::async_trait]
impl SwapGate for Busy {
    async fn quiesce(&self) -> bool {
        self.finished.notified().await;
        true
    }
    async fn release(&self) {}
}

fn tools(bin: &Path, server: &TestServer) -> Tools {
    let client = Arc::new(shiranami_net::HttpClient::new().expect("the client builds"));
    let runner: Arc<dyn ProcessRunner> = Arc::new(FileVersionRunner);
    let ytdlp = YtDlpManager::new(
        bin.to_path_buf(),
        Platform::Windows,
        Arc::clone(&client),
        Arc::clone(&runner),
    )
    .with_upstream(server.url("/api"), server.url("/releases"));
    let ffmpeg = FfmpegManager::new(bin.to_path_buf(), Platform::Windows, client, runner);
    Tools::new(ytdlp, ffmpeg)
}

async fn hex_of(body: &str) -> String {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let path = temp.path().join("body");
    tokio::fs::write(&path, body).await.expect("write");
    checksum::digest_file(&path)
        .await
        .expect("hash")
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// The three replies an update fetches, in the order it fetches them.
async fn release(asset: &str, listed_digest_of: &str) -> Vec<Reply> {
    let sums = format!(
        "{}  yt-dlp.exe\n{}  yt-dlp_macos\n",
        hex_of(listed_digest_of).await,
        hex_of("some other asset").await
    );
    vec![
        Reply::Body(format!(r#"{{"tag_name":"{NEW}"}}"#).into_bytes()),
        Reply::Body(asset.as_bytes().to_vec()),
        Reply::Body(sums.into_bytes()),
    ]
}

async fn installed(bin: &Path) -> PathBuf {
    let path = bin.join("yt-dlp.exe");
    tokio::fs::write(&path, OLD)
        .await
        .expect("place the old binary");
    path
}

async fn read(path: &Path) -> String {
    tokio::fs::read_to_string(path).await.expect("read")
}

#[tokio::test]
async fn a_newer_yt_dlp_is_verified_swapped_in_and_probed() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let sums = format!("{}  yt-dlp.exe\n", hex_of(NEW).await);
    // As GitHub serves it: the asset behind a redirect to its CDN, and the
    // sums file as a plain body with no length.
    let server = TestServer::start(vec![
        Reply::Body(format!(r#"{{"tag_name":"{NEW}"}}"#).into_bytes()),
        Reply::Redirect {
            status: 302,
            location: "/cdn/yt-dlp.exe".to_owned(),
        },
        Reply::Body(NEW.as_bytes().to_vec()),
        Reply::BodyWithoutLength(sums.into_bytes()),
    ])
    .await;
    let path = installed(temp.path()).await;

    let outcome = update_tool(Tool::Ytdlp, &tools(temp.path(), &server), &Open).await;

    assert_eq!(
        outcome,
        UpdateOutcome::Updated {
            from: Some(OLD.to_owned()),
            to: NEW.to_owned()
        }
    );
    assert_eq!(read(&path).await, NEW);
    assert!(
        !backup_path(&path).exists(),
        "the old binary is dropped once the new one runs"
    );
    assert_eq!(
        server.paths(),
        vec![
            "/api".to_owned(),
            format!("/releases/download/{NEW}/yt-dlp.exe"),
            "/cdn/yt-dlp.exe".to_owned(),
            format!("/releases/download/{NEW}/SHA2-256SUMS"),
        ],
        "the asset and its checksums are pinned to the tag the API named"
    );
}

#[tokio::test]
async fn a_checksum_mismatch_refuses_to_promote() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    // The sums file lists the digest of different bytes than were served.
    let server = TestServer::start(release(NEW, "tampered").await).await;
    let path = installed(temp.path()).await;

    let outcome = update_tool(Tool::Ytdlp, &tools(temp.path(), &server), &Open).await;

    assert_eq!(outcome, UpdateOutcome::Failed(CHECKSUM_MISMATCH.to_owned()));
    assert_eq!(read(&path).await, OLD, "the installed binary is untouched");
    assert!(
        !temp.path().join("yt-dlp.exe.tmp").exists(),
        "the refused download is not left behind"
    );
}

#[tokio::test]
async fn an_asset_missing_from_the_sums_file_is_refused() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start(vec![
        Reply::Body(format!(r#"{{"tag_name":"{NEW}"}}"#).into_bytes()),
        Reply::Body(NEW.as_bytes().to_vec()),
        Reply::Body(b"0000  yt-dlp_linux\n".to_vec()),
    ])
    .await;
    let path = installed(temp.path()).await;

    let outcome = update_tool(Tool::Ytdlp, &tools(temp.path(), &server), &Open).await;

    assert_eq!(
        outcome,
        UpdateOutcome::Failed(checksum::CHECKSUM_MISSING.to_owned())
    );
    assert_eq!(read(&path).await, OLD);
}

#[tokio::test]
async fn a_new_binary_that_fails_its_probe_is_rolled_back() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    // Correctly checksummed, and empty: it verifies, then will not run.
    let server = TestServer::start(release("", "").await).await;
    let path = installed(temp.path()).await;

    let outcome = update_tool(Tool::Ytdlp, &tools(temp.path(), &server), &Open).await;

    assert_eq!(outcome, UpdateOutcome::Failed(PROBE_FAILED.to_owned()));
    assert_eq!(read(&path).await, OLD, "the previous binary is restored");
    assert!(!backup_path(&path).exists());
}

#[tokio::test]
async fn the_swap_waits_for_the_gate() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start(release(NEW, NEW).await).await;
    let path = installed(temp.path()).await;
    let tools = Arc::new(tools(temp.path(), &server));
    let gate = Arc::new(Busy::default());

    let update = {
        let (tools, gate) = (Arc::clone(&tools), Arc::clone(&gate));
        tokio::spawn(async move { update_tool(Tool::Ytdlp, &tools, gate.as_ref()).await })
    };

    // Staging finishes while "downloads" are still running…
    for _ in 0..2_000 {
        if server.paths().len() == 3 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(1)).await;
    }
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert!(
        !update.is_finished(),
        "the swap is still waiting on the gate"
    );
    assert_eq!(
        read(&path).await,
        OLD,
        "nothing is swapped under a running download"
    );

    // …and the swap happens only once they are done.
    gate.finished.notify_one();
    let outcome = update.await.expect("the task completes");
    assert!(matches!(outcome, UpdateOutcome::Updated { .. }));
    assert_eq!(read(&path).await, NEW);
}

#[tokio::test]
async fn an_up_to_date_yt_dlp_downloads_nothing() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start(vec![Reply::Body(
        format!(r#"{{"tag_name":"{OLD}"}}"#).into_bytes(),
    )])
    .await;
    installed(temp.path()).await;

    let outcome = update_tool(Tool::Ytdlp, &tools(temp.path(), &server), &Open).await;

    assert_eq!(outcome, UpdateOutcome::UpToDate);
    assert_eq!(server.paths(), vec!["/api".to_owned()]);
}

#[tokio::test]
async fn an_unreachable_upstream_is_a_quiet_skip() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start(vec![Reply::Failing(403)]).await;
    installed(temp.path()).await;

    let outcome = update_tool(Tool::Ytdlp, &tools(temp.path(), &server), &Open).await;

    assert_eq!(outcome, UpdateOutcome::Unreachable);
}

#[tokio::test]
async fn a_missing_tool_is_never_installed_automatically() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start(Vec::new()).await;

    let outcome = update_tool(Tool::Ytdlp, &tools(temp.path(), &server), &Open).await;

    assert_eq!(outcome, UpdateOutcome::NotInstalled);
    assert!(server.paths().is_empty());
}

#[tokio::test]
async fn a_manual_install_is_checksum_verified_too() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start(vec![
        Reply::Body(NEW.as_bytes().to_vec()),
        Reply::Body(format!("{}  yt-dlp.exe\n", hex_of("tampered").await).into_bytes()),
    ])
    .await;
    let tools = tools(temp.path(), &server);

    let error = tools.ytdlp.install(None).await.expect_err("refused");

    assert_eq!(error.to_string(), CHECKSUM_MISMATCH);
    assert!(!tools.ytdlp.is_installed().await);
    assert_eq!(
        server.paths(),
        vec![
            "/releases/latest/download/yt-dlp.exe".to_owned(),
            "/releases/latest/download/SHA2-256SUMS".to_owned(),
        ]
    );
}
