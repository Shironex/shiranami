//! Replacing an installed binary without ever losing the working one.
//!
//! [`crate::bin::install::promote`] is a single rename over the final path,
//! which is atomic but has two gaps an unattended update cannot live with:
//!
//! - **Nothing to go back to.** Once the rename lands the previous binary is
//!   gone. If the new one does not run (a truncated asset that happened to pass
//!   no check, a build for the wrong architecture, Gatekeeper refusing it), the
//!   user is left with a broken tool and no record of what worked.
//! - **Windows refuses it outright while the binary runs.** Replacing a file
//!   that backs a running process fails with a sharing violation. *Renaming*
//!   that same file is allowed, which is the whole trick below.
//!
//! So a promotion here is two renames per binary: the current file moves aside
//! to `<name>.old`, then the staged file moves into its place. The caller probes
//! the result, and either [`commit`]s (dropping the `.old` copies) or
//! [`roll_back`]s (restoring them). A running yt-dlp keeps executing its own,
//! now renamed, image on every platform.
//!
//! Between the two renames the final path does not exist for a moment. A spawn
//! that lands exactly there fails with "not found" and is reported like any
//! other failed spawn; the download queue is held idle across an automatic
//! swap, so that window is only reachable by a search or a stream lookup.
//!
//! # A marker makes the pair one unit
//!
//! Before the first rename, [`promote_all`] writes `<first binary>.swapping`,
//! recording which binaries had a predecessor. It is removed first thing in
//! [`commit`], and by a successful [`roll_back`]. So a `.swapping` file on disk
//! means exactly one thing: a swap started and was neither committed nor
//! rolled back. [`recover`] acts only then, and rolls the **whole** pair back
//! to the previous build, whatever point the crash hit: after the first
//! binary was promoted and before the second was touched, between the two
//! renames of one binary, or after both. A crash after the new pair was probed
//! but before the commit also rolls back (conservatively); the next scheduled
//! check installs it again.
//!
//! Without a marker, a `.old` file is only ever a leftover (Windows could not
//! delete a `.old` that was still running) and is never restored: restoring it
//! would put an older build over a newer good one. The next promotion sweeps
//! it, but only while the binary it belonged to is present, so the last copy of
//! a tool is never deleted.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::bin::install::remove_quietly;
use crate::error::{DownloaderError, Result};

/// One binary that has been moved into place, and where its predecessor went.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Promoted {
    /// The final path, now holding the new binary.
    pub final_path: PathBuf,
    /// The previous binary, when there was one to keep.
    pub backup: Option<PathBuf>,
}

/// Where a binary waits while its replacement is proven.
///
/// Appended rather than substituted, for the reason
/// [`crate::bin::install::temporary_path`] gives: `with_extension` would drop
/// the `.exe`.
pub fn backup_path(final_path: &Path) -> PathBuf {
    let mut name = OsString::from(final_path.as_os_str());
    name.push(".old");
    PathBuf::from(name)
}

/// Where the in-progress marker for a swap whose first binary is
/// `first_final` lives. See the module docs.
pub fn marker_path(first_final: &Path) -> PathBuf {
    let mut name = OsString::from(first_final.as_os_str());
    name.push(".swapping");
    PathBuf::from(name)
}

/// Move each `(staged, final)` pair into place, keeping what each replaces.
///
/// All or nothing: if any rename fails, the whole pair is rolled back through
/// [`recover`] before the error is returned, so a two-binary tool (ffmpeg and
/// ffprobe) never ends up with one new binary beside one old one. The same
/// holds across a crash, through the marker (see the module docs).
///
/// # Errors
///
/// [`DownloaderError::Io`] for the marker write or the rename that failed.
pub async fn promote_all(pairs: &[(PathBuf, PathBuf)]) -> Result<Vec<Promoted>> {
    let finals: Vec<PathBuf> = pairs
        .iter()
        .map(|(_, final_path)| final_path.clone())
        .collect();
    let Some(first) = finals.first() else {
        return Ok(Vec::new());
    };

    // Stale backups of every binary in the pair go before the first rename, so
    // none of them can be mistaken for this swap's. Only while the binary they
    // belong to is present: a lone `.old` may be the last copy there is.
    let mut had_previous = Vec::with_capacity(finals.len());
    for final_path in &finals {
        let present = exists(final_path).await;
        if present {
            remove_quietly(&backup_path(final_path)).await;
        }
        had_previous.push(present);
    }

    let record: String = had_previous
        .iter()
        .map(|had| if *had { '1' } else { '0' })
        .collect();
    let marker = marker_path(first);
    tokio::fs::write(&marker, record)
        .await
        .map_err(|source| DownloaderError::Io {
            operation: "mark the binary swap as in progress at",
            path: marker.clone(),
            source,
        })?;

    let mut promoted = Vec::with_capacity(pairs.len());
    for ((staged, final_path), had) in pairs.iter().zip(had_previous) {
        if let Err(error) = promote_one(staged, final_path, had).await {
            recover(&finals).await;
            return Err(error);
        }
        promoted.push(Promoted {
            final_path: final_path.clone(),
            backup: had.then(|| backup_path(final_path)),
        });
    }

    Ok(promoted)
}

async fn promote_one(staged: &Path, final_path: &Path, had_previous: bool) -> Result<()> {
    if had_previous {
        rename(
            final_path,
            &backup_path(final_path),
            "set the previous binary aside as",
        )
        .await?;
    }
    // On failure the staged file stays where it was for the caller to clean
    // up, and `promote_all` rolls the pair back.
    rename(staged, final_path, "install the new binary as").await
}

/// Undo a promotion: put the whole pair back as it was.
///
/// Each restore is **one rename of `.old` over the final path**, never "delete
/// the new file, then rename": `rename` replaces its target atomically on Unix,
/// and Rust's `rename` on Windows is `MoveFileExW` with
/// `MOVEFILE_REPLACE_EXISTING`, so at no instant is there no binary at all. A
/// binary with no predecessor (a first install) is removed, which leaves the
/// tool "not installed" rather than installed and broken.
///
/// Never fails, because it runs on a path that is already reporting an error,
/// but answers whether every predecessor is back, so that error can say so
/// truthfully instead of claiming the previous version was kept.
pub async fn roll_back(promoted: &[Promoted]) -> bool {
    let finals: Vec<PathBuf> = promoted
        .iter()
        .map(|entry| entry.final_path.clone())
        .collect();
    recover(&finals).await
}

/// Roll back a swap that was started and neither committed nor rolled back.
///
/// Does nothing unless the swap's marker exists; see the module docs for why a
/// `.old` on its own is never restored. With the marker, every binary that had
/// a predecessor gets it back (one rename over the final path), and every one
/// that did not is removed, so the pair is the previous build again.
///
/// Answers `true` when the pair is consistent afterwards: no swap was pending,
/// or every restore worked (the marker is then removed). Answers `false` if
/// any restore failed; the marker stays, so the next call tries again, and no
/// binary was deleted to get there.
///
/// Callers must hold the tool's install lock (or know no install can run), or
/// this would read a live swap as an interrupted one.
pub async fn recover(finals: &[PathBuf]) -> bool {
    let Some(first) = finals.first() else {
        return true;
    };
    let marker = marker_path(first);
    let Ok(record) = tokio::fs::read_to_string(&marker).await else {
        return true;
    };

    tracing::warn!(?finals, "rolling back an unfinished binary swap");
    let record: Vec<char> = record.trim().chars().collect();
    let mut consistent = true;

    for (index, final_path) in finals.iter().enumerate() {
        let backup = backup_path(final_path);
        // An unreadable record falls back to "had a predecessor if its backup
        // is there", which is the safe reading: it never deletes a binary.
        let had_previous = match record.get(index) {
            Some('0') if record.len() == finals.len() => false,
            Some('1') if record.len() == finals.len() => true,
            _ => exists(&backup).await,
        };

        if !had_previous {
            remove_quietly(final_path).await;
        } else if exists(&backup).await {
            consistent &= restore(&backup, final_path).await;
        } else if !exists(final_path).await {
            // Neither the binary nor its backup: nothing left to restore.
            tracing::error!(path = %final_path.display(), "a binary and its backup are both missing");
            consistent = false;
        }
        // Otherwise it was never set aside: the previous build is still there.
    }

    if consistent {
        remove_quietly(&marker).await;
    }
    consistent
}

/// Whether a swap of `finals` was started and neither committed nor rolled
/// back. A file-existence check, cheap enough to ask before taking any lock.
pub async fn is_pending(finals: &[PathBuf]) -> bool {
    match finals.first() {
        Some(first) => exists(&marker_path(first)).await,
        None => false,
    }
}

async fn exists(path: &Path) -> bool {
    tokio::fs::try_exists(path).await.unwrap_or(false)
}

/// Keep a promotion: drop the predecessors.
///
/// A backup that cannot be removed (Windows, still running) is left for the
/// next promotion to sweep. See the module docs.
pub async fn commit(promoted: &[Promoted]) {
    // The marker first: from here on the new pair is the installed one, and a
    // crash below leaves only leftover backups, which are never restored.
    if let Some(first) = promoted.first() {
        remove_quietly(&marker_path(&first.final_path)).await;
    }
    for backup in promoted.iter().filter_map(|entry| entry.backup.as_ref()) {
        remove_quietly(backup).await;
    }
}

/// Rename `backup` over `final_path`, replacing it. Answers whether it worked.
async fn restore(backup: &Path, final_path: &Path) -> bool {
    match tokio::fs::rename(backup, final_path).await {
        Ok(()) => true,
        Err(error) => {
            tracing::error!(
                backup = %backup.display(),
                path = %final_path.display(),
                %error,
                "could not restore the previous binary"
            );
            false
        }
    }
}

async fn rename(from: &Path, to: &Path, operation: &'static str) -> Result<()> {
    tokio::fs::rename(from, to)
        .await
        .map_err(|source| DownloaderError::Io {
            operation,
            path: to.to_path_buf(),
            source,
        })
}

#[cfg(test)]
mod tests {
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

    /// Gate finding N6: a restore that fails leaves the binary that is there,
    /// keeps the marker for another try, and says it failed.
    #[tokio::test]
    async fn a_restore_that_fails_is_reported_and_deletes_nothing() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let final_path = temp.path().join("yt-dlp");
        write(&marker_path(&final_path), "1").await;
        write(&final_path, "new").await;
        // A directory cannot be renamed over a file, so this restore fails.
        tokio::fs::create_dir(backup_path(&final_path))
            .await
            .expect("mkdir");

        assert!(!recover(std::slice::from_ref(&final_path)).await);
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
}
