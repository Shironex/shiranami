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
//! Deleting a `.old` that is still running fails on Windows. That is left
//! behind deliberately and swept by the next promotion, which removes any stale
//! backup before it makes a new one.

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

/// Move each `(staged, final)` pair into place, keeping what each replaces.
///
/// All or nothing: if any pair fails, every pair already promoted is rolled
/// back before the error is returned, so a two-binary tool (ffmpeg and ffprobe)
/// never ends up with one new binary beside one old one.
///
/// # Errors
///
/// [`DownloaderError::Io`] for the rename that failed.
pub async fn promote_all(pairs: &[(PathBuf, PathBuf)]) -> Result<Vec<Promoted>> {
    let mut promoted = Vec::with_capacity(pairs.len());

    for (staged, final_path) in pairs {
        match promote_one(staged, final_path).await {
            Ok(done) => promoted.push(done),
            Err(error) => {
                roll_back(&promoted).await;
                return Err(error);
            }
        }
    }

    Ok(promoted)
}

async fn promote_one(staged: &Path, final_path: &Path) -> Result<Promoted> {
    let backup = backup_path(final_path);
    // A backup left by an earlier run whose `.old` was still running.
    remove_quietly(&backup).await;

    let had_previous = tokio::fs::try_exists(final_path).await.unwrap_or(false);
    if had_previous {
        rename(final_path, &backup, "set the previous binary aside as").await?;
    }

    if let Err(error) = rename(staged, final_path, "install the new binary as").await {
        if had_previous {
            // Put the original back; the staged file stays where it was for
            // the caller to clean up.
            restore(&backup, final_path).await;
        }
        return Err(error);
    }

    Ok(Promoted {
        final_path: final_path.to_path_buf(),
        backup: had_previous.then_some(backup),
    })
}

/// Undo a promotion: remove each new binary and put its predecessor back.
///
/// Best effort and logged, never failing: this runs on a path that is already
/// reporting an error, and a second error would hide the first. A binary with
/// no predecessor (a first install) is simply removed, which leaves the tool
/// "not installed" rather than installed and broken.
pub async fn roll_back(promoted: &[Promoted]) {
    for entry in promoted.iter().rev() {
        remove_quietly(&entry.final_path).await;
        if let Some(backup) = &entry.backup {
            restore(backup, &entry.final_path).await;
        }
    }
}

/// Keep a promotion: drop the predecessors.
///
/// A backup that cannot be removed (Windows, still running) is left for the
/// next promotion to sweep. See the module docs.
pub async fn commit(promoted: &[Promoted]) {
    for backup in promoted.iter().filter_map(|entry| entry.backup.as_ref()) {
        remove_quietly(backup).await;
    }
}

async fn restore(backup: &Path, final_path: &Path) {
    if let Err(error) = tokio::fs::rename(backup, final_path).await {
        tracing::error!(
            backup = %backup.display(),
            path = %final_path.display(),
            %error,
            "could not restore the previous binary"
        );
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
    fn the_backup_keeps_the_exe_suffix() {
        assert_eq!(
            backup_path(Path::new("/data/bin/yt-dlp.exe")),
            PathBuf::from("/data/bin/yt-dlp.exe.old")
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
        assert!(!staged.exists());

        commit(&promoted).await;
        assert!(!backup_path(&final_path).exists());
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
        roll_back(&promoted).await;

        assert_eq!(read(&final_path).await, "old");
        assert!(!backup_path(&final_path).exists());
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

        roll_back(&promoted).await;
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
        assert_eq!(
            read(&ffmpeg).await,
            "old ffmpeg",
            "ffmpeg and ffprobe must not end up from different builds"
        );
        assert_eq!(read(&ffprobe).await, "old ffprobe");
    }

    #[tokio::test]
    async fn a_stale_backup_from_an_earlier_run_is_swept() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let staged = temp.path().join("yt-dlp.tmp");
        let final_path = temp.path().join("yt-dlp");
        write(&backup_path(&final_path), "ancient").await;
        write(&final_path, "old").await;
        write(&staged, "new").await;

        promote_all(&[(staged, final_path.clone())])
            .await
            .expect("promotes over a stale backup");

        assert_eq!(read(&backup_path(&final_path)).await, "old");
    }
}
