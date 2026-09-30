//! `library:validate-files` — which of these paths are gone from disk.
//!
//! Ported from `library.ts:371-408`.
//!
//! # It reports; it does not decide
//!
//! There is no `missing` column, no `deleted_at`, no `last_seen` and no
//! tombstone anywhere in the schema. This function is pure filesystem and
//! touches no SQL, exactly as v1's handler did — it returns the paths that
//! failed an existence check and stops there. The renderer maps them back to
//! track ids and calls `db:tracks:remove-many` itself
//! (`useLibraryRescan.ts:91-106`), which is a **hard delete**, cascading to
//! playlist membership and play history.
//!
//! That division of labour is worth stating plainly because of what it costs.
//! v1 treated *any* failed check as missing, so an unreadable volume, a
//! permissions error or a dead network mount made every track on it "missing",
//! and they were then permanently removed.
//!
//! # v2 changes one thing: only "not found" is missing
//!
//! Live folder watching (F10) made that failure automatic rather than something
//! a user had to click into, so the answer here is now three-valued. A path the
//! OS reports as not found is missing, as before. A path that cannot be checked
//! at all (`EACCES`, `EIO`, a timed-out or stale network handle) is *unknown*,
//! and unknown is not returned: the row stays. A genuinely deleted file is
//! still reported and still removed, by the manual Rescan and the watcher
//! alike. The watcher's renderer path adds its own per-folder guards on top
//! (`apps/web/src/lib/folderScope.ts`), because an unmounted drive *does* read
//! as not found.

use std::path::{Path, PathBuf};

use rayon::prelude::*;

/// Paths checked per batch. v1's `VALIDATE_CONCURRENCY`.
///
/// In v1 this bounded 128 simultaneous `fs.access` promises, so one huge library
/// could not open fifty thousand descriptors at once. Here it is the batch
/// granularity, and the concurrency ceiling is rayon's pool instead: "128 in
/// flight" in a threaded runtime means 128 OS threads, which is worse than the
/// problem the number was chosen to solve. Input order and duplicates are
/// preserved as v1 preserved them.
pub const VALIDATE_BATCH: usize = 128;

/// Return the paths that are no longer on disk, in input order.
///
/// # Semantics worth not tidying
///
/// - **Only "not found" means missing.** v1 wrapped `fs.access(path, F_OK)` in
///   a bare `catch`, so `EACCES`, `EIO` and a disconnected network mount all
///   read as `ENOENT` and all led to deletion. [`Path::try_exists`] tells them
///   apart, and anything other than a clean "does not exist" keeps the path
///   out of the result. See the module docs for why this was changed. It is
///   not a volume check: an unmounted drive or share usually leaves its mount
///   point behind, so its files read as a clean "not found" and are reported.
///   The watcher's per-folder guards in the renderer exist for that case.
/// - **Symlinks are followed**, unlike discovery, which skips them outright. A
///   symlinked track already in the database therefore validates fine even
///   though a scan could never have discovered it.
/// - **Duplicates are preserved.** The input is not deduplicated, so a path
///   listed twice appears twice in the result.
/// - **No progress is emitted.** v1 emits none either, which is why validating
///   fifty thousand paths over a slow volume is a silent pause in the UI.
pub fn validate_files(paths: &[PathBuf]) -> Vec<PathBuf> {
    let missing: Vec<PathBuf> = paths
        .par_chunks(VALIDATE_BATCH)
        .flat_map_iter(|batch| {
            batch
                .iter()
                .filter(|path| !exists(path))
                .cloned()
                .collect::<Vec<_>>()
        })
        .collect();

    if missing.is_empty() {
        tracing::info!(
            checked = paths.len(),
            "validation complete: every file exists"
        );
    } else {
        tracing::warn!(
            missing = missing.len(),
            checked = paths.len(),
            "validation found missing files"
        );
    }

    missing
}

/// Whether `path` should be kept: it exists, or it could not be checked.
fn exists(path: &Path) -> bool {
    match path.try_exists() {
        Ok(found) => found,
        Err(error) => {
            tracing::debug!(%error, path = %path.display(), "could not check a track; keeping it");
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, b"x").expect("the fixture writes");
        path
    }

    #[test]
    fn only_the_absent_paths_come_back() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let present = write(dir.path(), "here.mp3");
        let absent = dir.path().join("gone.mp3");

        assert_eq!(
            validate_files(&[present, absent.clone()]),
            vec![absent],
            "the survivors are not returned — only the missing"
        );
    }

    #[test]
    fn the_result_keeps_input_order() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let first = dir.path().join("a.mp3");
        let present = write(dir.path(), "b.mp3");
        let last = dir.path().join("c.mp3");

        assert_eq!(
            validate_files(&[first.clone(), present, last.clone()]),
            vec![first, last]
        );
    }

    #[test]
    fn order_survives_batching() {
        // More than one batch, so the ordering guarantee is actually exercised
        // rather than trivially held by a single chunk.
        let dir = tempfile::tempdir().expect("a temp dir");
        let paths: Vec<PathBuf> = (0..VALIDATE_BATCH * 3)
            .map(|index| dir.path().join(format!("{index}.mp3")))
            .collect();

        assert_eq!(validate_files(&paths), paths);
    }

    #[test]
    fn duplicates_are_preserved_rather_than_collapsed() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let absent = dir.path().join("gone.mp3");

        assert_eq!(
            validate_files(&[absent.clone(), absent.clone()]),
            vec![absent.clone(), absent]
        );
    }

    #[test]
    fn a_directory_counts_as_present() {
        // v1 checks `F_OK`, not "is a regular file". A directory at a track's
        // path is not missing, so it is not deleted.
        let dir = tempfile::tempdir().expect("a temp dir");
        let subdir = dir.path().join("album");
        std::fs::create_dir(&subdir).expect("the fixture writes");

        assert!(validate_files(&[subdir]).is_empty());
    }

    #[test]
    fn a_symlinked_track_validates_even_though_a_scan_would_skip_it() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let target = write(dir.path(), "real.mp3");
        let link = dir.path().join("link.mp3");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&target, &link).expect("the fixture links");
        #[cfg(windows)]
        if std::os::windows::fs::symlink_file(&target, &link).is_err() {
            // Windows needs developer mode or elevation to create symlinks.
            return;
        }

        assert!(
            validate_files(&[link]).is_empty(),
            "validation follows symlinks; discovery skips them"
        );
    }

    /// The gate's case: every file on a volume answers `EACCES`. None of them
    /// is reported, so none is deleted. A genuinely deleted file next to them
    /// still is.
    #[cfg(unix)]
    #[test]
    fn an_unreadable_file_is_not_missing_but_a_deleted_one_is() {
        use std::os::unix::fs::PermissionsExt as _;

        let dir = tempfile::tempdir().expect("a temp dir");
        let locked = dir.path().join("locked");
        std::fs::create_dir(&locked).expect("the fixture writes");
        let unreadable = write(&locked, "a.mp3");
        let gone = dir.path().join("gone.mp3");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000))
            .expect("the fixture locks");

        let result = validate_files(&[unreadable.clone(), gone.clone()]);

        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755))
            .expect("the fixture unlocks");
        // Under root the bits do not bite and the file simply exists, which
        // leaves it out of the result all the same.
        assert_eq!(result, vec![gone]);
    }

    #[test]
    fn an_empty_input_is_an_empty_result() {
        assert!(validate_files(&[]).is_empty());
    }
}
