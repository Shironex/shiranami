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
//! An unmounted external drive makes every track on it "missing", and they are
//! then permanently removed — no soft delete, no grace period, no per-volume
//! availability check, even though [`crate::storage`] models exactly that
//! concept one module over. v1 behaves this way and v2 reproduces it, because
//! the decision to delete lives in `apps/web`, which is unchanged (architecture
//! §2.6). If it is ever softened, the fix belongs there or in a v2-native flow —
//! not in a silent behaviour change here.

use std::path::{Path, PathBuf};

use rayon::prelude::*;

/// Paths checked per batch. v1's `VALIDATE_CONCURRENCY`.
///
/// In v1 this bounded 128 simultaneous `fs.access` promises, so one huge library
/// could not open fifty thousand descriptors at once. Here it is the batch
/// granularity, and the concurrency ceiling is rayon's pool instead: "128 in
/// flight" in a threaded runtime means 128 OS threads, which is worse than the
/// problem the number was chosen to solve. The observable behaviour — input
/// order, duplicates preserved, any error meaning missing — is unchanged.
pub const VALIDATE_BATCH: usize = 128;

/// Return the paths that are no longer on disk, in input order.
///
/// # Semantics worth not tidying
///
/// - **Any error means missing.** v1 wrapped `fs.access(path, F_OK)` in a bare
///   `catch` returning the path, so `EACCES`, `EIO`, `ENOTDIR` and a
///   disconnected network mount are all indistinguishable from `ENOENT` — and
///   all lead to deletion. [`Path::try_exists`] would let us tell them apart;
///   using it would change which tracks survive a rescan on a permission-denied
///   volume, so [`Path::exists`]'s "any failure is a false" is what is used.
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

/// v1's `fs.access(path, F_OK)` reduced to its observable answer.
fn exists(path: &Path) -> bool {
    path.exists()
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

    #[test]
    fn an_empty_input_is_an_empty_result() {
        assert!(validate_files(&[]).is_empty());
    }
}
