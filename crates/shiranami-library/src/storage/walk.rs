//! Summing the logical size of everything under a folder.
//!
//! Ported from `sumDirectorySize` (`apps/desktop/src/main/ipc/storage.ts:69-113`).
//!
//! # It counts more than the scanner imports
//!
//! Every regular file counts, not just audio: cover JPEGs, `.cue` sheets,
//! `.log`, `.nfo` and `.DS_Store` all land in the total. And the depth bound is
//! 12, not the scanner's 5, so the bar happily counts bytes a scan would never
//! reach. Both are v1's, and both are why "music bytes" is a folder-occupancy
//! figure rather than a library figure.
//!
//! Sizes are logical (`stat.size`), so a sparse or filesystem-compressed file
//! over-reports against the blocks it actually occupies. v1 has the same
//! property, and the panel's captions are written around it.

use std::path::Path;

use walkdir::WalkDir;

/// v1's `WALK_MAX_DEPTH`, in v1's units: directory levels below the root whose
/// contents are read. Deliberately *not* the scanner's [`SCAN_MAX_DEPTH`].
///
/// [`SCAN_MAX_DEPTH`]: crate::scan::SCAN_MAX_DEPTH
pub const WALK_MAX_DEPTH: usize = 12;

/// The same bound in `walkdir`'s units — see [`crate::scan::discover`] for the
/// off-by-one this converts.
const WALKDIR_MAX_DEPTH: usize = WALK_MAX_DEPTH + 1;

/// Sum the logical sizes of every regular file under `dir`.
///
/// Best-effort by design, matching v1 failure for failure: an unreadable
/// directory is logged and contributes zero while the walk continues, a file
/// whose metadata cannot be read contributes zero, anything past the depth bound
/// is truncated, and symlinks are skipped entirely — the last one for the same
/// `Dirent` reason discovery skips them, which also means no cycle can be
/// followed.
///
/// v1 batched its `stat` calls 128 at a time to bound descriptor pressure in an
/// async runtime that would otherwise have issued all of them at once. There is
/// no threaded analogue worth reproducing — a sequential walk holds one
/// descriptor — so the batching is dropped and the constant with it. Nothing
/// observable changes: the return value is a sum.
pub fn sum_directory_size(dir: &Path) -> u64 {
    let mut total: u64 = 0;

    for entry in WalkDir::new(dir).max_depth(WALKDIR_MAX_DEPTH) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                tracing::warn!(%error, "failed to read directory while measuring usage");
                continue;
            }
        };

        if !entry.file_type().is_file() {
            continue;
        }

        match entry.metadata() {
            Ok(metadata) => total = total.saturating_add(metadata.len()),
            Err(error) => {
                tracing::warn!(%error, path = %entry.path().display(), "failed to measure a file");
            }
        }
    }

    total
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn write(path: &Path, bytes: usize) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("the fixture writes");
        }
        fs::write(path, vec![b'x'; bytes]).expect("the fixture writes");
    }

    #[test]
    fn every_regular_file_counts_regardless_of_type() {
        let dir = tempfile::tempdir().expect("a temp dir");
        write(&dir.path().join("a.mp3"), 100);
        write(&dir.path().join("cover.jpg"), 50);
        write(&dir.path().join("notes.txt"), 25);

        assert_eq!(sum_directory_size(dir.path()), 175);
    }

    #[test]
    fn nested_directories_are_summed() {
        let dir = tempfile::tempdir().expect("a temp dir");
        write(&dir.path().join("a.mp3"), 10);
        write(&dir.path().join("Artist/Album/b.mp3"), 20);

        assert_eq!(sum_directory_size(dir.path()), 30);
    }

    #[test]
    fn an_empty_or_missing_directory_measures_zero() {
        let dir = tempfile::tempdir().expect("a temp dir");
        assert_eq!(sum_directory_size(dir.path()), 0);
        assert_eq!(sum_directory_size(&dir.path().join("nope")), 0);
    }

    #[test]
    fn the_walk_stops_past_twelve_levels() {
        let dir = tempfile::tempdir().expect("a temp dir");

        // A file at level 12 is counted; one at level 13 is not.
        let mut inside = PathBuf::from(dir.path());
        for level in 0..12 {
            inside.push(format!("d{level}"));
        }
        write(&inside.join("counted.mp3"), 7);

        assert_eq!(sum_directory_size(dir.path()), 7);

        inside.push("d12");
        write(&inside.join("truncated.mp3"), 1_000);

        assert_eq!(
            sum_directory_size(dir.path()),
            7,
            "a file thirteen levels down is past the bound"
        );
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_skipped_so_nothing_is_double_counted() {
        let dir = tempfile::tempdir().expect("a temp dir");
        write(&dir.path().join("real.mp3"), 40);
        std::os::unix::fs::symlink(dir.path().join("real.mp3"), dir.path().join("link.mp3"))
            .expect("the fixture links");

        assert_eq!(sum_directory_size(dir.path()), 40);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_loop_terminates() {
        let dir = tempfile::tempdir().expect("a temp dir");
        write(&dir.path().join("real.mp3"), 5);
        std::os::unix::fs::symlink(dir.path(), dir.path().join("loop")).expect("the fixture links");

        assert_eq!(sum_directory_size(dir.path()), 5);
    }
}
