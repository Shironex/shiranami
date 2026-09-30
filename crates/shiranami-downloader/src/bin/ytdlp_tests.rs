//! Tests for `bin::ytdlp`, kept beside it so the module stays one job.

use super::*;
use crate::spawn::ProcessOutput;
use crate::spawn::runner::LineSink;

/// A runner answering one fixed result, for the version probe.
struct Fixed(std::result::Result<ProcessOutput, crate::spawn::ProcessError>);

#[async_trait::async_trait]
impl ProcessRunner for Fixed {
    async fn run(
        &self,
        _spec: ProcessSpec,
        _lines: Option<&(dyn LineSink + '_)>,
        _cancel: &CancellationToken,
    ) -> std::result::Result<ProcessOutput, crate::spawn::ProcessError> {
        match &self.0 {
            Ok(output) => Ok(output.clone()),
            Err(_) => Err(crate::spawn::ProcessError::Spawn {
                program: PathBuf::from("yt-dlp"),
                source: std::io::Error::other("boom"),
            }),
        }
    }
}

fn manager(
    bin_dir: PathBuf,
    result: std::result::Result<ProcessOutput, crate::spawn::ProcessError>,
) -> YtDlpManager {
    YtDlpManager::new(
        bin_dir,
        Platform::MacOs,
        Arc::new(HttpClient::new().expect("the client builds")),
        Arc::new(Fixed(result)),
    )
}

fn output(stdout: &str, code: i32) -> ProcessOutput {
    ProcessOutput {
        stdout: stdout.to_owned(),
        code,
        ..ProcessOutput::default()
    }
}

#[tokio::test]
async fn an_absent_binary_reports_no_version_without_spawning() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    // The runner would panic-free succeed if reached; absence must
    // short-circuit before it.
    let manager = manager(temp.path().to_path_buf(), Ok(output("2024.01.01\n", 0)));

    assert!(!manager.is_installed().await);
    assert_eq!(manager.version().await, None);
}

#[tokio::test]
async fn an_installed_binary_reports_its_trimmed_version() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(temp.path().to_path_buf(), Ok(output("2024.01.01\n", 0)));
    tokio::fs::write(manager.path(), b"binary")
        .await
        .expect("place a binary");

    assert_eq!(manager.version().await, Some("2024.01.01".to_owned()));
}

#[tokio::test]
async fn a_failing_version_probe_reports_unknown_rather_than_failing() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(
        temp.path().to_path_buf(),
        Err(crate::spawn::ProcessError::Cancelled),
    );
    tokio::fs::write(manager.path(), b"binary")
        .await
        .expect("place a binary");

    assert_eq!(
        manager.version().await,
        None,
        "the settings panel must render beside a broken probe, not fail"
    );
}

#[tokio::test]
async fn a_non_zero_version_probe_reports_unknown() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(temp.path().to_path_buf(), Ok(output("", 1)));
    tokio::fs::write(manager.path(), b"binary")
        .await
        .expect("place a binary");

    assert_eq!(manager.version().await, None);
}

/// A guard only proves "yt-dlp's lock is held" because the manager checks
/// where it came from: a fresh lock's guard and ffmpeg's are both refused,
/// before anything is downloaded.
#[tokio::test]
async fn a_guard_from_another_lock_is_refused() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(temp.path().to_path_buf(), Ok(output("", 0)));

    let stranger = InstallLock::default();
    let foreign = stranger.lock().await;
    let error = manager
        .stage(&foreign, Some("2026.09.20"), None)
        .await
        .expect_err("a fresh lock's guard");
    assert_eq!(error.to_string(), crate::bin::lock::FOREIGN_GUARD);

    let ffmpeg = crate::bin::FfmpegManager::new(
        temp.path().to_path_buf(),
        Platform::MacOs,
        Arc::new(HttpClient::new().expect("the client builds")),
        Arc::new(Fixed(Ok(output("", 0)))),
    );
    let ffmpegs = ffmpeg.lock_install().await;
    let error = manager
        .stage(&ffmpegs, Some("2026.09.20"), None)
        .await
        .expect_err("another tool's guard");
    assert_eq!(error.to_string(), crate::bin::lock::FOREIGN_GUARD);

    let own = manager.lock_install().await;
    assert!(own.check(&manager.install_lock).is_ok());
    assert!(
        manager.stage(&own, Some("../x"), None).await.is_err(),
        "the tag goes into a URL path, so only a plain tag is staged"
    );
}

/// Make the next restore onto `final_path` fail the way it really would,
/// without touching product code (see `swap`'s test module for the same
/// helper and why). On Unix a directory cannot replace a file, so the
/// backup is one. On Windows `rename` refuses to replace a destination that
/// is open with no sharing at all (no `FILE_SHARE_DELETE`), so the
/// destination is held open for as long as the returned guard lives; drop
/// it before the path needs to be read or removed again.
#[cfg(unix)]
async fn make_restore_fail(backup: &Path, _final_path: &Path) -> Option<std::fs::File> {
    tokio::fs::create_dir(backup).await.expect("mkdir");
    None
}

#[cfg(windows)]
async fn make_restore_fail(backup: &Path, final_path: &Path) -> Option<std::fs::File> {
    use std::os::windows::fs::OpenOptionsExt as _;

    tokio::fs::write(backup, b"old")
        .await
        .expect("write the backup");
    let final_path = final_path.to_path_buf();
    let file = tokio::task::spawn_blocking(move || {
        std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&final_path)
            .expect("hold the destination open with no sharing")
    })
    .await
    .expect("the blocking open task runs");
    Some(file)
}

/// A swap left pending by a rollback that could not finish is not
/// promoted over: its `.old` may be the last known-good build.
#[tokio::test]
async fn a_pending_swap_that_cannot_be_rolled_back_blocks_promotion() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(temp.path().to_path_buf(), Ok(output("2026.09.20", 0)));
    let final_path = manager.path();
    // Pending, and its restore fails (see `make_restore_fail`).
    tokio::fs::write(swap::marker_path(&final_path), "1")
        .await
        .expect("marker");
    tokio::fs::write(&final_path, b"half").await.expect("final");
    let block = make_restore_fail(&swap::backup_path(&final_path), &final_path).await;

    let staged_path = temp.path().join("yt-dlp.staged.tmp");
    tokio::fs::write(&staged_path, b"new")
        .await
        .expect("staged");
    let digest = checksum::digest_file(&staged_path).await.expect("hash");
    let guard = manager.lock_install().await;
    let staged = StagedYtDlp {
        path: staged_path.clone(),
        digest,
        _under: PhantomData,
    };

    let error = manager
        .promote_staged(&guard, staged)
        .await
        .expect_err("refused");
    drop(block);

    assert_eq!(error.to_string(), swap::SWAP_PENDING);
    assert!(
        swap::backup_path(&final_path).exists(),
        "the backup is kept"
    );
    assert!(swap::is_pending(std::slice::from_ref(&final_path)).await);
    assert!(!staged_path.exists());
}

#[test]
fn the_managed_path_follows_the_platform() {
    let client = Arc::new(HttpClient::new().expect("the client builds"));
    let runner: Arc<dyn ProcessRunner> = Arc::new(Fixed(Ok(ProcessOutput::default())));

    let windows = YtDlpManager::new(
        PathBuf::from("/data/bin"),
        Platform::Windows,
        Arc::clone(&client),
        Arc::clone(&runner),
    );
    assert_eq!(windows.path(), PathBuf::from("/data/bin/yt-dlp.exe"));

    let mac = YtDlpManager::new(PathBuf::from("/data/bin"), Platform::MacOs, client, runner);
    assert_eq!(mac.path(), PathBuf::from("/data/bin/yt-dlp"));
}

/// A torn marker left by a first install that crashed before its rename-in:
/// neither a binary nor a backup exists. That must not wedge every later
/// install of yt-dlp; the next one clears it and succeeds.
#[tokio::test]
async fn a_torn_first_install_marker_does_not_block_the_next_install() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(temp.path().to_path_buf(), Ok(output("2026.09.20", 0)));
    let final_path = manager.path();
    tokio::fs::write(swap::marker_path(&final_path), "")
        .await
        .expect("a torn marker");

    let staged_path = temp.path().join("yt-dlp.next.tmp");
    tokio::fs::write(&staged_path, b"new")
        .await
        .expect("staged");
    let digest = checksum::digest_file(&staged_path).await.expect("hash");
    let guard = manager.lock_install().await;
    let staged = StagedYtDlp {
        path: staged_path,
        digest,
        _under: PhantomData,
    };

    let version = manager
        .promote_staged(&guard, staged)
        .await
        .expect("the next install goes ahead");

    assert_eq!(version, "2026.09.20");
    assert!(final_path.exists());
    assert!(!swap::is_pending(std::slice::from_ref(&final_path)).await);
}
