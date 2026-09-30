//! Tests for `bin::ffmpeg`, kept beside it so the module stays one job.

use super::*;
use crate::spawn::ProcessOutput;
use crate::spawn::runner::LineSink;

struct Fixed(ProcessOutput);

#[async_trait::async_trait]
impl ProcessRunner for Fixed {
    async fn run(
        &self,
        _spec: ProcessSpec,
        _lines: Option<&(dyn LineSink + '_)>,
        _cancel: &CancellationToken,
    ) -> std::result::Result<ProcessOutput, crate::spawn::ProcessError> {
        Ok(self.0.clone())
    }
}

fn manager(bin_dir: PathBuf, platform: Platform, banner: &str) -> FfmpegManager {
    FfmpegManager::new(
        bin_dir,
        platform,
        Arc::new(HttpClient::new().expect("the client builds")),
        Arc::new(Fixed(ProcessOutput {
            stdout: banner.to_owned(),
            ..ProcessOutput::default()
        })),
    )
}

async fn place_both(manager: &FfmpegManager) {
    tokio::fs::write(manager.ffmpeg_path(), b"binary")
        .await
        .expect("place ffmpeg");
    tokio::fs::write(manager.ffprobe_path(), b"binary")
        .await
        .expect("place ffprobe");
}

#[tokio::test]
async fn both_binaries_must_be_present_to_count_as_installed() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(temp.path().to_path_buf(), Platform::MacOs, "");

    assert!(!manager.is_installed().await);

    tokio::fs::write(manager.ffmpeg_path(), b"binary")
        .await
        .expect("place ffmpeg");
    assert!(
        !manager.is_installed().await,
        "ffmpeg alone is not enough — yt-dlp's post-processing needs \
         ffprobe too"
    );

    tokio::fs::write(manager.ffprobe_path(), b"binary")
        .await
        .expect("place ffprobe");
    assert!(manager.is_installed().await);
}

#[tokio::test]
async fn reads_the_version_out_of_a_release_banner() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(
        temp.path().to_path_buf(),
        Platform::MacOs,
        "ffmpeg version 7.1 Copyright (c) 2000-2024 the FFmpeg developers\n\
         built with Apple clang\n",
    );
    place_both(&manager).await;

    assert_eq!(manager.version().await, Some("7.1".to_owned()));
}

#[tokio::test]
async fn reads_the_version_out_of_a_nightly_banner() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(
        temp.path().to_path_buf(),
        Platform::MacOs,
        "ffmpeg version N-113573-g4a2d1b0f9d Copyright (c) 2000-2024\n",
    );
    place_both(&manager).await;

    assert_eq!(
        manager.version().await,
        Some("N-113573-g4a2d1b0f9d".to_owned())
    );
}

#[tokio::test]
async fn falls_back_to_the_whole_first_line_when_the_banner_is_unfamiliar() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(
        temp.path().to_path_buf(),
        Platform::MacOs,
        "  some other build banner  \nsecond line\n",
    );
    place_both(&manager).await;

    assert_eq!(
        manager.version().await,
        Some("some other build banner".to_owned())
    );
}

#[tokio::test]
async fn an_absent_install_reports_no_version() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(
        temp.path().to_path_buf(),
        Platform::MacOs,
        "ffmpeg version 7.1",
    );

    assert_eq!(manager.version().await, None);
}

#[tokio::test]
async fn a_platform_with_no_automatic_install_refuses_with_v1s_message() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(temp.path().to_path_buf(), Platform::Other, "");

    let error = manager.install(None).await.expect_err("nothing to install");

    assert_eq!(error.to_string(), UNSUPPORTED_PLATFORM);
}

#[tokio::test]
async fn a_platform_with_no_automatic_install_reports_no_latest_version() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(temp.path().to_path_buf(), Platform::Other, "");

    assert_eq!(manager.latest_version().await, None);
}

/// A pair staged by hand, as `stage` would leave it.
async fn staged_pair<'g>(dir: &std::path::Path) -> crate::bin::StagedFfmpeg<'g> {
    let stage = dir.join("_ffmpeg_stage-test");
    tokio::fs::create_dir_all(&stage).await.expect("mkdir");
    let (ffmpeg, ffprobe) = (stage.join("ffmpeg"), stage.join("ffprobe"));
    tokio::fs::write(&ffmpeg, b"new ffmpeg")
        .await
        .expect("write");
    tokio::fs::write(&ffprobe, b"new ffprobe")
        .await
        .expect("write");
    crate::bin::StagedFfmpeg {
        ffmpeg_digest: checksum::digest_file(&ffmpeg).await.expect("hash"),
        ffprobe_digest: checksum::digest_file(&ffprobe).await.expect("hash"),
        dir: stage,
        ffmpeg,
        ffprobe,
        _under: std::marker::PhantomData,
    }
}

/// Make the next restore onto `final_path` fail the way it really would,
/// without touching product code (see `swap`'s test module for the same
/// helper and why). On Unix a directory cannot replace a file, so the
/// backup is one. On Windows `rename` refuses to replace a destination that
/// is open with no sharing at all (no `FILE_SHARE_DELETE`), so the
/// destination is held open for as long as the returned guard lives; drop
/// it before the path needs to be read or removed again.
#[cfg(unix)]
async fn make_restore_fail(
    backup: &std::path::Path,
    _final_path: &std::path::Path,
) -> Option<std::fs::File> {
    tokio::fs::create_dir(backup).await.expect("mkdir");
    None
}

#[cfg(windows)]
async fn make_restore_fail(
    backup: &std::path::Path,
    final_path: &std::path::Path,
) -> Option<std::fs::File> {
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

/// A pending pair swap whose rollback cannot finish blocks promotion: its
/// `.old` may be the last working ffmpeg.
#[tokio::test]
async fn a_pending_pair_swap_that_cannot_be_rolled_back_blocks_promotion() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(
        temp.path().to_path_buf(),
        Platform::MacOs,
        "ffmpeg version 9.0.2",
    );
    let ffmpeg = manager.ffmpeg_path();
    tokio::fs::write(swap::marker_path(&ffmpeg), "11")
        .await
        .expect("marker");
    tokio::fs::write(&ffmpeg, b"half").await.expect("write");
    // The restore fails (see `make_restore_fail`).
    let block = make_restore_fail(&swap::backup_path(&ffmpeg), &ffmpeg).await;

    let guard = manager.lock_install().await;
    let staged = staged_pair(temp.path()).await;
    let error = manager
        .promote_staged(&guard, staged)
        .await
        .expect_err("refused");
    drop(block);

    assert_eq!(error.to_string(), swap::SWAP_PENDING);
    assert!(swap::backup_path(&ffmpeg).exists());
    assert!(swap::is_pending(&[ffmpeg, manager.ffprobe_path()]).await);
}

/// A torn marker left by a first pair install that crashed after ffmpeg
/// moved in and before ffprobe did. The next install goes ahead and ends
/// with a consistent pair.
#[tokio::test]
async fn a_torn_first_pair_install_does_not_block_the_next_install() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let manager = manager(
        temp.path().to_path_buf(),
        Platform::MacOs,
        "ffmpeg version 9.0.2",
    );
    let (ffmpeg, ffprobe) = (manager.ffmpeg_path(), manager.ffprobe_path());
    tokio::fs::write(swap::marker_path(&ffmpeg), "\0\0")
        .await
        .expect("marker");
    tokio::fs::write(&ffmpeg, b"interrupted ffmpeg")
        .await
        .expect("write");

    let guard = manager.lock_install().await;
    let staged = staged_pair(temp.path()).await;
    let version = manager
        .promote_staged(&guard, staged)
        .await
        .expect("the next install goes ahead");

    assert_eq!(version, "9.0.2");
    assert_eq!(tokio::fs::read(&ffmpeg).await.expect("read"), b"new ffmpeg");
    assert_eq!(
        tokio::fs::read(&ffprobe).await.expect("read"),
        b"new ffprobe"
    );
    assert!(!swap::is_pending(&[ffmpeg.clone(), ffprobe.clone()]).await);
    assert!(!swap::backup_path(&ffmpeg).exists() && !swap::backup_path(&ffprobe).exists());
}
