//! Tests for `bin::swap`, kept beside it so the module stays one job.

use super::*;

async fn write(path: &Path, body: &str) {
    tokio::fs::write(path, body).await.expect("write a file");
}

async fn read(path: &Path) -> String {
    tokio::fs::read_to_string(path).await.expect("read a file")
}

#[test]
fn the_backup_and_the_marker_keep_the_exe_suffix() {
    assert_eq!(
        backup_path(Path::new("/data/bin/yt-dlp.exe")),
        PathBuf::from("/data/bin/yt-dlp.exe.old")
    );
    assert_eq!(
        marker_path(Path::new("/data/bin/ffmpeg.exe")),
        PathBuf::from("/data/bin/ffmpeg.exe.swapping")
    );
}

#[tokio::test]
async fn promotion_keeps_the_previous_binary_until_commit() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let staged = temp.path().join("yt-dlp.tmp");
    let final_path = temp.path().join("yt-dlp");
    write(&final_path, "old").await;
    write(&staged, "new").await;

    let promoted = promote_all(&[(staged.clone(), final_path.clone())])
        .await
        .expect("promotes");

    assert_eq!(read(&final_path).await, "new");
    assert_eq!(read(&backup_path(&final_path)).await, "old");
    assert!(is_pending(std::slice::from_ref(&final_path)).await);
    assert!(!staged.exists());

    commit(&promoted).await;
    assert!(!backup_path(&final_path).exists());
    assert!(!is_pending(std::slice::from_ref(&final_path)).await);
    assert_eq!(read(&final_path).await, "new");
}

#[tokio::test]
async fn rolling_back_restores_the_previous_binary() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let staged = temp.path().join("yt-dlp.tmp");
    let final_path = temp.path().join("yt-dlp");
    write(&final_path, "old").await;
    write(&staged, "new").await;

    let promoted = promote_all(&[(staged, final_path.clone())])
        .await
        .expect("promotes");
    assert!(roll_back(&promoted).await, "the predecessor is back");

    assert_eq!(read(&final_path).await, "old");
    assert!(!backup_path(&final_path).exists());
    assert!(!is_pending(std::slice::from_ref(&final_path)).await);
}

#[tokio::test]
async fn rolling_back_a_first_install_leaves_nothing_behind() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let staged = temp.path().join("yt-dlp.tmp");
    let final_path = temp.path().join("yt-dlp");
    write(&staged, "new").await;

    let promoted = promote_all(&[(staged, final_path.clone())])
        .await
        .expect("promotes");
    assert_eq!(promoted[0].backup, None);

    assert!(roll_back(&promoted).await);
    assert!(
        !final_path.exists(),
        "a binary that failed its probe is not left installed"
    );
}

#[tokio::test]
async fn a_failed_second_pair_rolls_back_the_first() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let ffmpeg = temp.path().join("ffmpeg");
    let ffprobe = temp.path().join("ffprobe");
    let staged_ffmpeg = temp.path().join("stage-ffmpeg");
    write(&ffmpeg, "old ffmpeg").await;
    write(&ffprobe, "old ffprobe").await;
    write(&staged_ffmpeg, "new ffmpeg").await;

    // The staged ffprobe does not exist, so its rename fails.
    let error = promote_all(&[
        (staged_ffmpeg, ffmpeg.clone()),
        (temp.path().join("stage-ffprobe-missing"), ffprobe.clone()),
    ])
    .await
    .expect_err("the second rename fails");

    assert!(matches!(error, DownloaderError::Io { .. }));
    assert_eq!(read(&ffmpeg).await, "old ffmpeg");
    assert_eq!(read(&ffprobe).await, "old ffprobe");
    assert!(!is_pending(&[ffmpeg, ffprobe]).await);
}

/// Gate finding N2 (a): a crash after ffmpeg was promoted and before
/// ffprobe was touched. No final file is missing, so only the marker can
/// tell this apart from a healthy install.
#[tokio::test]
async fn a_crash_between_the_pair_rolls_both_back() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let ffmpeg = temp.path().join("ffmpeg");
    let ffprobe = temp.path().join("ffprobe");
    write(&marker_path(&ffmpeg), "11").await;
    write(&ffmpeg, "new ffmpeg").await;
    write(&backup_path(&ffmpeg), "old ffmpeg").await;
    write(&ffprobe, "old ffprobe").await;

    assert!(recover(&[ffmpeg.clone(), ffprobe.clone()]).await);

    assert_eq!(read(&ffmpeg).await, "old ffmpeg");
    assert_eq!(read(&ffprobe).await, "old ffprobe", "one build, not two");
    assert!(!is_pending(&[ffmpeg, ffprobe]).await);
}

#[tokio::test]
async fn a_crash_between_one_binarys_renames_is_rolled_back() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let final_path = temp.path().join("yt-dlp");
    write(&marker_path(&final_path), "1").await;
    write(&backup_path(&final_path), "old").await;

    assert!(recover(std::slice::from_ref(&final_path)).await);
    assert_eq!(read(&final_path).await, "old");
    assert!(!backup_path(&final_path).exists());
    assert!(
        recover(std::slice::from_ref(&final_path)).await,
        "nothing pending afterwards"
    );
}

/// Gate finding N2 (b): Windows could not delete a running `ffprobe.old`
/// after a good update. With no swap pending, it must never be restored
/// over the newer ffprobe.
#[tokio::test]
async fn a_leftover_backup_is_never_restored() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let ffmpeg = temp.path().join("ffmpeg");
    let ffprobe = temp.path().join("ffprobe");
    write(&ffmpeg, "new ffmpeg").await;
    write(&ffprobe, "new ffprobe").await;
    write(&backup_path(&ffprobe), "stale ffprobe").await;

    assert!(recover(&[ffmpeg.clone(), ffprobe.clone()]).await);
    assert_eq!(read(&ffprobe).await, "new ffprobe");
}

/// …and the next promotion sweeps it before its first rename, so the
/// backup it keeps is this swap's and not the stale one.
#[tokio::test]
async fn a_promotion_sweeps_the_pairs_stale_backups_first() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let ffmpeg = temp.path().join("ffmpeg");
    let ffprobe = temp.path().join("ffprobe");
    let (stage_ffmpeg, stage_ffprobe) = (temp.path().join("s1"), temp.path().join("s2"));
    write(&ffmpeg, "old ffmpeg").await;
    write(&ffprobe, "old ffprobe").await;
    write(&backup_path(&ffprobe), "ancient ffprobe").await;
    write(&stage_ffmpeg, "new ffmpeg").await;
    write(&stage_ffprobe, "new ffprobe").await;

    let promoted = promote_all(&[
        (stage_ffmpeg, ffmpeg.clone()),
        (stage_ffprobe, ffprobe.clone()),
    ])
    .await
    .expect("promotes");
    assert_eq!(read(&backup_path(&ffprobe)).await, "old ffprobe");

    assert!(roll_back(&promoted).await);
    assert_eq!(read(&ffprobe).await, "old ffprobe", "not the ancient one");
}

/// Make the next restore onto `final_path` fail the way it really would,
/// without touching product code. On Unix a directory cannot replace a
/// file, so the backup is one. On Windows `rename` refuses to replace a
/// destination that is open with no sharing at all (no `FILE_SHARE_DELETE`),
/// so the destination is held open for as long as the returned guard lives;
/// drop it before the path needs to be read or removed again.
#[cfg(unix)]
async fn make_restore_fail(backup: &Path, _final_path: &Path) -> Option<std::fs::File> {
    tokio::fs::create_dir(backup).await.expect("mkdir");
    None
}

#[cfg(windows)]
async fn make_restore_fail(backup: &Path, final_path: &Path) -> Option<std::fs::File> {
    use std::os::windows::fs::OpenOptionsExt as _;

    write(backup, "old").await;
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

/// Gate finding N6: a restore that fails leaves the binary that is there,
/// keeps the marker for another try, and says it failed.
#[tokio::test]
async fn a_restore_that_fails_is_reported_and_deletes_nothing() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let final_path = temp.path().join("yt-dlp");
    write(&marker_path(&final_path), "1").await;
    write(&final_path, "new").await;
    let block = make_restore_fail(&backup_path(&final_path), &final_path).await;

    assert!(!recover(std::slice::from_ref(&final_path)).await);
    drop(block);
    assert_eq!(
        read(&final_path).await,
        "new",
        "the only binary there is stays"
    );
    assert!(is_pending(std::slice::from_ref(&final_path)).await);
}

/// Gate finding N6: a lone `.old` whose binary is missing may be the last
/// copy, so a promotion never sweeps it.
#[tokio::test]
async fn a_promotion_never_deletes_a_backup_whose_binary_is_missing() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let final_path = temp.path().join("yt-dlp");
    let staged = temp.path().join("yt-dlp.tmp");
    write(&backup_path(&final_path), "last copy").await;
    write(&staged, "new").await;

    let promoted = promote_all(&[(staged, final_path.clone())])
        .await
        .expect("promotes");

    assert_eq!(read(&backup_path(&final_path)).await, "last copy");
    assert_eq!(promoted[0].backup, None, "it was not this swap's backup");
}

/// A torn marker (a crash before its bytes reached the disk, or a
/// filesystem that tore it) must never cost a binary, before or after the
/// first rename.
#[tokio::test]
async fn a_torn_marker_never_deletes_a_binary() {
    for torn in ["", "\0\0", "1", "111", "x1", "\n"] {
        // Before the first rename: both binaries still the old build.
        let temp = tempfile::tempdir().expect("a temporary directory");
        let ffmpeg = temp.path().join("ffmpeg");
        let ffprobe = temp.path().join("ffprobe");
        write(&ffmpeg, "old ffmpeg").await;
        write(&ffprobe, "old ffprobe").await;
        write(&marker_path(&ffmpeg), torn).await;

        assert!(
            recover(&[ffmpeg.clone(), ffprobe.clone()]).await,
            "{torn:?}"
        );
        assert_eq!(read(&ffmpeg).await, "old ffmpeg", "{torn:?}");
        assert_eq!(read(&ffprobe).await, "old ffprobe", "{torn:?}");

        // After the first rename: ffmpeg promoted beside its backup, and
        // ffprobe, which has no backup, must not be removed.
        write(&marker_path(&ffmpeg), torn).await;
        write(&backup_path(&ffmpeg), "old ffmpeg").await;
        write(&ffmpeg, "new ffmpeg").await;

        assert!(
            recover(&[ffmpeg.clone(), ffprobe.clone()]).await,
            "{torn:?}"
        );
        assert_eq!(read(&ffmpeg).await, "old ffmpeg", "{torn:?}");
        assert_eq!(read(&ffprobe).await, "old ffprobe", "{torn:?}");
    }
}

#[test]
fn only_a_well_formed_record_is_read() {
    assert_eq!(parse_record("10", 2), Some(vec![true, false]));
    assert_eq!(parse_record("10\n", 2), Some(vec![true, false]));
    assert_eq!(parse_record("", 2), None);
    assert_eq!(parse_record("\0\0", 2), None);
    assert_eq!(parse_record("1", 2), None);
    assert_eq!(parse_record("12", 2), None);
}

/// The marker is written through a flushed temporary file and a rename,
/// so what lands is the whole record.
#[tokio::test]
async fn the_marker_is_written_whole() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let marker = marker_path(&temp.path().join("ffmpeg"));

    write_marker(&marker, "10").await.expect("writes");

    assert_eq!(read(&marker).await, "10");
    assert!(!crate::bin::install::temporary_path(&marker).exists());
}

/// Windows cannot delete a `.old` that is still running. A swap over it
/// would fail half-way and roll the stale backup over the newer binary, so
/// it must refuse before touching anything. A non-empty directory stands
/// in for the undeletable file.
#[tokio::test]
async fn an_undeletable_stale_backup_stops_the_swap_before_it_starts() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let ffmpeg = temp.path().join("ffmpeg");
    let ffprobe = temp.path().join("ffprobe");
    let (stage_ffmpeg, stage_ffprobe) = (temp.path().join("s1"), temp.path().join("s2"));
    write(&ffmpeg, "current ffmpeg").await;
    write(&ffprobe, "current ffprobe").await;
    write(&stage_ffmpeg, "new ffmpeg").await;
    write(&stage_ffprobe, "new ffprobe").await;
    tokio::fs::create_dir(backup_path(&ffprobe))
        .await
        .expect("mkdir");
    write(&backup_path(&ffprobe).join("running"), "stale").await;

    let error = promote_all(&[
        (stage_ffmpeg.clone(), ffmpeg.clone()),
        (stage_ffprobe.clone(), ffprobe.clone()),
    ])
    .await
    .expect_err("refused");

    assert_eq!(error.to_string(), STALE_BACKUP);
    assert_eq!(read(&ffmpeg).await, "current ffmpeg");
    assert_eq!(read(&ffprobe).await, "current ffprobe");
    assert!(
        stage_ffmpeg.exists() && stage_ffprobe.exists(),
        "nothing was moved"
    );
    assert!(
        !is_pending(&[ffmpeg, ffprobe]).await,
        "no marker was written"
    );
}

/// A pending swap (its rollback could not finish) is not started over:
/// that would sweep its `.old`, the last known-good build.
#[tokio::test]
async fn a_pending_swap_is_not_started_over() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let final_path = temp.path().join("yt-dlp");
    let staged = temp.path().join("yt-dlp.tmp");
    write(&marker_path(&final_path), "1").await;
    write(&final_path, "half-installed").await;
    write(&backup_path(&final_path), "known good").await;
    write(&staged, "new").await;

    let error = promote_all(&[(staged, final_path.clone())])
        .await
        .expect_err("refused");

    assert_eq!(error.to_string(), SWAP_PENDING);
    assert_eq!(read(&backup_path(&final_path)).await, "known good");
    assert_eq!(read(&marker_path(&final_path)).await, "1");
}

/// A torn marker on a first install, crashed before anything moved in: there
/// is nothing to restore, so the marker goes after one honest report and
/// never blocks a later install.
#[tokio::test]
async fn a_marker_with_nothing_to_restore_is_cleared_after_one_report() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let ffmpeg = temp.path().join("ffmpeg");
    let ffprobe = temp.path().join("ffprobe");
    write(&marker_path(&ffmpeg), "").await;

    assert!(
        !recover(&[ffmpeg.clone(), ffprobe.clone()]).await,
        "reported once: the pair is not there"
    );
    assert!(!is_pending(&[ffmpeg.clone(), ffprobe.clone()]).await);
    assert!(recover(&[ffmpeg, ffprobe]).await, "and never again");
}

/// Gate probe (`commit_probe.rs`): the marker cannot be removed at commit.
/// Every backup must stay, so the still-pending marker rolls the whole pair
/// back to one build rather than half of one. A non-empty directory stands in
/// for the undeletable marker.
#[tokio::test]
async fn a_commit_that_cannot_remove_the_marker_keeps_every_backup() {
    let temp = tempfile::tempdir().expect("a temporary directory");
    let ffmpeg = temp.path().join("ffmpeg");
    let ffprobe = temp.path().join("ffprobe");
    let (s1, s2) = (temp.path().join("s1"), temp.path().join("s2"));
    write(&ffmpeg, "B ffmpeg").await;
    write(&ffprobe, "B ffprobe").await;
    write(&s1, "C ffmpeg").await;
    write(&s2, "C ffprobe").await;
    let promoted = promote_all(&[(s1, ffmpeg.clone()), (s2, ffprobe.clone())])
        .await
        .expect("promotes");

    let marker = marker_path(&ffmpeg);
    tokio::fs::remove_file(&marker)
        .await
        .expect("swap the marker");
    tokio::fs::create_dir(&marker).await.expect("mkdir");
    write(&marker.join("held"), "").await;

    commit(&promoted).await;

    assert!(is_pending(&[ffmpeg.clone(), ffprobe.clone()]).await);
    assert_eq!(read(&backup_path(&ffmpeg)).await, "B ffmpeg");
    assert_eq!(read(&backup_path(&ffprobe)).await, "B ffprobe");

    // The pending marker (unreadable, so torn) rolls the pair back as one.
    recover(&[ffmpeg.clone(), ffprobe.clone()]).await;
    assert_eq!(read(&ffmpeg).await, "B ffmpeg");
    assert_eq!(read(&ffprobe).await, "B ffprobe");
}
