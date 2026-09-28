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
//! recording which binaries had a predecessor. [`commit`] removes it before it
//! touches any backup, and keeps every backup if the removal fails; a
//! [`roll_back`] removes it once nothing retryable is left. So a `.swapping`
//! file on disk means exactly one thing: a swap started and was neither
//! committed nor fully rolled back. [`recover`] acts only then, and rolls the **whole** pair back
//! to the previous build, whatever point the crash hit: after the first
//! binary was promoted and before the second was touched, between the two
//! renames of one binary, or after both. A crash after the new pair was probed
//! but before the commit also rolls back (conservatively); the next scheduled
//! check installs it again.
//!
//! The marker is written through a flushed temporary file and a rename (and,
//! on Unix, a flushed directory), so on a filesystem that honours those
//! flushes a crash leaves either no marker or a whole one. On one that does
//! not, a torn record (empty, NUL-filled, the wrong length) is read as "every
//! binary had a predecessor": recovery then restores whatever backups are
//! there and **never removes a binary**. The cost is that an interrupted
//! *first* install may be left in place rather than removed, which is the
//! harmless direction. A torn record cannot tell a mid-swap `.old` from a stale
//! one, so a `.old` beside a missing binary is restored even though it might
//! be an older build: that keeps the tool working, where skipping it would
//! leave no binary at all, and the next update replaces it.
//!
//! # A marker never wedges installs
//!
//! [`recover`] keeps the marker only when a rename or removal it attempted
//! actually failed, which is worth retrying (a file still in use). When a
//! binary has neither its final file nor a `.old`, there is nothing to put
//! back, so the marker goes: recovery reports the pair inconsistent for that
//! one call and every later install proceeds. A marker whose `.old` exists but
//! could not be restored is never cleared, because that `.old` may be the last
//! working copy.
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
/// # Refusals, all before anything is renamed
///
/// - **A swap is already pending** (its marker is on disk, because an earlier
///   rollback could not finish). Starting over it would sweep that swap's
///   `.old`, the last known-good build, and overwrite its marker. The caller
///   must [`recover`] first; the managers do, under their install lock.
/// - **A stale backup cannot be cleared.** On Windows a `.old` that is still
///   running cannot be deleted. Setting the current binary aside onto it would
///   then fail half-way, and a rollback would restore that *stale* backup over
///   the newer binary. So the swap stops cleanly instead, and the next window
///   tries again.
///
/// # Errors
///
/// `InstallFailed` carrying [`SWAP_PENDING`] or [`STALE_BACKUP`] for the two
/// refusals above, [`DownloaderError::Io`] for the marker write or the rename
/// that failed.
pub async fn promote_all(pairs: &[(PathBuf, PathBuf)]) -> Result<Vec<Promoted>> {
    let finals: Vec<PathBuf> = pairs
        .iter()
        .map(|(_, final_path)| final_path.clone())
        .collect();
    let Some(first) = finals.first() else {
        return Ok(Vec::new());
    };

    if is_pending(&finals).await {
        return Err(DownloaderError::InstallFailed {
            message: SWAP_PENDING.to_owned(),
        });
    }

    // Stale backups of every binary in the pair go before the first rename, so
    // none of them can be mistaken for this swap's. Only while the binary they
    // belong to is present: a lone `.old` may be the last copy there is.
    let mut had_previous = Vec::with_capacity(finals.len());
    for final_path in &finals {
        let present = exists(final_path).await;
        if present {
            let backup = backup_path(final_path);
            remove_quietly(&backup).await;
            if exists(&backup).await {
                tracing::warn!(path = %backup.display(), "a stale backup could not be cleared; not swapping");
                return Err(DownloaderError::InstallFailed {
                    message: STALE_BACKUP.to_owned(),
                });
            }
        }
        had_previous.push(present);
    }

    let record: String = had_previous
        .iter()
        .map(|had| if *had { '1' } else { '0' })
        .collect();
    write_marker(&marker_path(first), &record).await?;

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

/// What [`promote_all`] answers when a swap of the same binaries is pending.
pub const SWAP_PENDING: &str = "An earlier update of this tool was interrupted and its previous \
     version could not be put back yet. Restart Shiranami, or close anything using the tool, and try again";

/// What [`promote_all`] answers when a stale backup cannot be cleared.
pub const STALE_BACKUP: &str = "A previous copy of this tool could not be cleared away \
     (it may still be running), so the update was not started. It is tried again later";

/// Write the marker durably and atomically: a temporary file, flushed to disk,
/// renamed into place, and (on Unix) the directory flushed too. A crash can
/// then leave no marker or a complete one, never an empty or half-written one
/// on a filesystem that honours the flushes. [`recover`] still treats a
/// malformed record as "never remove a binary", for filesystems that do not.
async fn write_marker(marker: &Path, record: &str) -> Result<()> {
    use tokio::io::AsyncWriteExt as _;

    let io_error = |source| DownloaderError::Io {
        operation: "mark the binary swap as in progress at",
        path: marker.to_path_buf(),
        source,
    };
    let temporary = crate::bin::install::temporary_path(marker);

    let mut file = tokio::fs::File::create(&temporary)
        .await
        .map_err(io_error)?;
    file.write_all(record.as_bytes()).await.map_err(io_error)?;
    file.sync_all().await.map_err(io_error)?;
    drop(file);
    tokio::fs::rename(&temporary, marker)
        .await
        .map_err(io_error)?;

    // Windows cannot open a directory as a file to flush it, and NTFS journals
    // the rename; Unix needs the directory entry flushed for the rename to
    // survive a power cut.
    #[cfg(unix)]
    if let Some(directory) = marker.parent() {
        let flushed = match tokio::fs::File::open(directory).await {
            Ok(directory) => directory.sync_all().await,
            Err(error) => Err(error),
        };
        if let Err(error) = flushed {
            tracing::debug!(%error, "could not flush the binary directory");
        }
    }
    Ok(())
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
/// or every restore worked and the marker is gone. Answers `false` otherwise,
/// in one of two ways that callers tell apart with [`is_pending`]:
///
/// - **Retryable.** A restore rename, a removal or the marker removal failed.
///   The marker stays, so the next call tries again, and nothing was deleted
///   to get there.
/// - **Nothing left to restore.** A binary had neither its final file nor a
///   `.old`. The marker is removed anyway, so this is reported once and never
///   blocks a later install.
///
/// Callers must hold the tool's install lock (or know no install can run), or
/// this would read a live swap as an interrupted one.
pub async fn recover(finals: &[PathBuf]) -> bool {
    let Some(first) = finals.first() else {
        return true;
    };
    let marker = marker_path(first);
    if !exists(&marker).await {
        return true;
    }

    tracing::warn!(?finals, "rolling back an unfinished binary swap");
    // A marker that exists but cannot be read is as torn as an empty one.
    let record = tokio::fs::read_to_string(&marker)
        .await
        .ok()
        .and_then(|record| parse_record(&record, finals.len()));
    let mut consistent = true;
    // Only a failed rename or removal keeps the marker: that is retryable.
    let mut retry = false;

    for (index, final_path) in finals.iter().enumerate() {
        let backup = backup_path(final_path);
        // Only a well-formed record can say "this binary had no predecessor",
        // which is the one answer that removes a binary. A torn record (empty,
        // NUL-filled, the wrong length) reads as "had one" for every binary,
        // so recovery then only ever restores a backup that is there and
        // never deletes anything.
        let had_previous = record.as_ref().is_none_or(|record| record[index]);

        if !had_previous {
            if !remove_file(final_path).await {
                consistent = false;
                retry = true;
            }
        } else if exists(&backup).await {
            if !restore(&backup, final_path).await {
                consistent = false;
                retry = true;
            }
        } else if !exists(final_path).await {
            // Neither the binary nor its backup: nothing left to restore, and
            // no retry would change that. Reported, then the marker goes, so
            // it cannot block every later install of this tool.
            tracing::error!(path = %final_path.display(), "a binary and its backup are both missing");
            consistent = false;
        }
        // Otherwise it was never set aside: the previous build is still there.
    }

    if !retry && !remove_marker(&marker).await {
        consistent = false;
    }
    consistent
}

/// Remove a file, treating "already gone" as success. Answers whether the
/// file is gone.
async fn remove_file(path: &Path) -> bool {
    match tokio::fs::remove_file(path).await {
        Ok(()) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
        Err(error) => {
            tracing::warn!(path = %path.display(), %error, "could not remove a file");
            false
        }
    }
}

/// Remove a swap marker. Answers whether it is gone.
async fn remove_marker(marker: &Path) -> bool {
    remove_file(marker).await
}

/// A marker's record: one `0` or `1` per binary, or `None` when it is not
/// exactly that.
fn parse_record(record: &str, binaries: usize) -> Option<Vec<bool>> {
    let record = record.trim();
    if record.len() != binaries {
        return None;
    }
    record
        .chars()
        .map(|flag| match flag {
            '0' => Some(false),
            '1' => Some(true),
            _ => None,
        })
        .collect()
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
    // The marker first: once it is gone the new pair is the installed one, and
    // a crash below leaves only leftover backups, which are never restored. If
    // it cannot be removed, the swap is still pending, so every backup stays:
    // deleting some of them would leave that marker rolling back a pair with
    // only half its predecessors.
    if let Some(first) = promoted.first()
        && !remove_marker(&marker_path(&first.final_path)).await
    {
        return;
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
#[path = "swap_tests.rs"]
mod tests;
