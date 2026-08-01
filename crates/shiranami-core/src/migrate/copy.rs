//! The copy itself: per-file atomic, resumable, and never a move.
//!
//! Decision D13 is "copy, never move, never delete", and §3.1's reasoning is
//! that copy semantics keep v1 bootable — which is the safety net the whole
//! update handover rests on. Nothing in this module opens a v1 path for writing
//! or unlinks one.
//!
//! # Why every file goes through a temp name
//!
//! A launch interrupted mid-copy must not leave a **truncated** file that looks
//! complete. Each file is written to a sibling `.<name>.migrating` and renamed
//! into place, so a destination path either does not exist or holds every byte
//! of its source. That is the same property [`crate::store::write_atomic`] gives
//! the settings file, for the same reason: a half-written `shiranami.db` that
//! the next launch treats as migrated is R6 exactly.
//!
//! # Why directories skip entries that already exist
//!
//! `album-art/` and `waveform-peaks/` are **content-addressed** — the filename
//! is `sha256(bytes)[0..32]` for art and `sha256(path|mtime|size)[0..32]` for
//! peaks — so a destination entry that already exists necessarily holds the same
//! bytes as its source. `backups/` is timestamp-named and immutable by
//! construction. Skipping is therefore not a heuristic, it is an identity, and
//! it is what makes an interrupted copy of a 500-file art cache cheap to resume
//! rather than a full re-copy every time.
//!
//! `logs/` skips for a different and stronger reason: the file appender is
//! already open on today's log by the time this runs (logging is boot stage
//! one), and renaming a copied file over it would leave the appender writing to
//! an unlinked inode. Copied history, live file untouched.

use std::path::Path;

use super::error::{MigrateError, Result};

/// The suffix a file wears while it is being written.
const IN_FLIGHT_SUFFIX: &str = ".migrating";

/// Whether an existing destination is left alone or replaced.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OnExisting {
    /// Overwrite. For the single files whose v1 bytes are the point of the
    /// exercise — the database and `config.json`.
    Replace,
    /// Leave it. For the content-addressed caches and the live log; see the
    /// module docs.
    Skip,
}

/// Copy one file, atomically. Returns the bytes copied, or `0` when skipped.
///
/// Creates the destination's parent directory. A missing source is `0` rather
/// than an error — the caller's file list is what v1 *may* have written, and
/// every entry on it is optional.
///
/// # Errors
///
/// [`MigrateError::CreateDirectory`] or [`MigrateError::Copy`].
pub fn file(from: &Path, to: &Path, on_existing: OnExisting) -> Result<u64> {
    if !from.is_file() {
        return Ok(0);
    }
    if on_existing == OnExisting::Skip && to.exists() {
        return Ok(0);
    }

    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|source| MigrateError::CreateDirectory {
            path: parent.to_path_buf(),
            source,
        })?;
    }

    let failed = |source: std::io::Error| MigrateError::Copy {
        from: from.to_path_buf(),
        to: to.to_path_buf(),
        source,
    };

    let mut in_flight = to.as_os_str().to_owned();
    in_flight.push(IN_FLIGHT_SUFFIX);
    let in_flight = std::path::PathBuf::from(in_flight);

    let copy_then_rename = || -> std::io::Result<u64> {
        let bytes = std::fs::copy(from, &in_flight)?;
        // The bytes have to be on disk before the rename, or a power loss
        // between the two leaves a file that exists at full length and reads
        // back as zeroes — which `quick_check` would call corruption on a
        // database and nothing would notice on a JPEG.
        std::fs::File::open(&in_flight)?.sync_data()?;
        std::fs::rename(&in_flight, to)?;
        Ok(bytes)
    };

    match copy_then_rename() {
        Ok(bytes) => Ok(bytes),
        Err(source) => {
            // Never leave `.migrating` litter behind for the next run to trip
            // over or for a user to find in their data directory.
            let _ = std::fs::remove_file(&in_flight);
            Err(failed(source))
        }
    }
}

/// Copy a directory tree. Returns the bytes copied.
///
/// A missing source directory is `0`. Symlinks are skipped entirely — both
/// files and directories — which is `shiranami-library`'s scan rule, adopted
/// here for a stronger reason: following one would copy data from outside the
/// v1 tree into the v2 tree, and a directory symlink would let a cycle run the
/// copy forever.
///
/// # Errors
///
/// [`MigrateError::CreateDirectory`] or [`MigrateError::Copy`].
pub fn tree(from: &Path, to: &Path, on_existing: OnExisting) -> Result<u64> {
    if !from.is_dir() {
        return Ok(0);
    }

    std::fs::create_dir_all(to).map_err(|source| MigrateError::CreateDirectory {
        path: to.to_path_buf(),
        source,
    })?;

    let entries = std::fs::read_dir(from).map_err(|source| MigrateError::Copy {
        from: from.to_path_buf(),
        to: to.to_path_buf(),
        source,
    })?;

    let mut copied = 0_u64;
    for entry in entries {
        let entry = entry.map_err(|source| MigrateError::Copy {
            from: from.to_path_buf(),
            to: to.to_path_buf(),
            source,
        })?;
        let source_path = entry.path();

        // `symlink_metadata` does not follow, which is the whole point.
        let metadata =
            std::fs::symlink_metadata(&source_path).map_err(|source| MigrateError::Copy {
                from: source_path.clone(),
                to: to.to_path_buf(),
                source,
            })?;
        if metadata.is_symlink() {
            tracing::debug!(path = %source_path.display(), "skipped a symlink in the v1 tree");
            continue;
        }

        let destination = to.join(entry.file_name());
        copied += if metadata.is_dir() {
            tree(&source_path, &destination, on_existing)?
        } else {
            file(&source_path, &destination, on_existing)?
        };
    }

    Ok(copied)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, body: &[u8]) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create the parent");
        }
        std::fs::write(path, body).expect("write the fixture");
    }

    #[test]
    fn a_file_is_copied_byte_for_byte_and_the_source_is_untouched() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let from = dir.path().join("v1/shiranami.db");
        let to = dir.path().join("v2/shiranami.db");
        write(&from, b"SQLite format 3\0payload");

        let copied = file(&from, &to, OnExisting::Replace).expect("copy the file");

        assert_eq!(copied, 23);
        assert_eq!(
            std::fs::read(&to).expect("read the copy"),
            b"SQLite format 3\0payload"
        );
        assert!(from.exists(), "copy, never move");
    }

    /// The whole reason for the temp name: nothing is left behind under it.
    #[test]
    fn a_completed_copy_leaves_no_in_flight_file() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let from = dir.path().join("v1/config.json");
        let to = dir.path().join("v2/config.json");
        write(&from, b"{}");

        file(&from, &to, OnExisting::Replace).expect("copy the file");

        let litter: Vec<_> = std::fs::read_dir(dir.path().join("v2"))
            .expect("read the destination")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.contains(IN_FLIGHT_SUFFIX))
            .collect();

        assert!(litter.is_empty(), "found {litter:?}");
    }

    #[test]
    fn a_missing_source_copies_nothing_rather_than_failing() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let copied = file(
            &dir.path().join("v1/absent.json"),
            &dir.path().join("v2/absent.json"),
            OnExisting::Replace,
        )
        .expect("an absent optional file is not an error");

        assert_eq!(copied, 0);
        assert!(!dir.path().join("v2/absent.json").exists());
    }

    #[test]
    fn skip_leaves_an_existing_destination_alone_and_replace_overwrites_it() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let from = dir.path().join("v1/a.jpg");
        let to = dir.path().join("v2/a.jpg");
        write(&from, b"v1 bytes");
        write(&to, b"already here");

        assert_eq!(
            file(&from, &to, OnExisting::Skip).expect("skip"),
            0,
            "nothing is copied when the destination exists"
        );
        assert_eq!(std::fs::read(&to).expect("read"), b"already here");

        file(&from, &to, OnExisting::Replace).expect("replace");
        assert_eq!(std::fs::read(&to).expect("read"), b"v1 bytes");
    }

    #[test]
    fn a_tree_is_copied_recursively_and_reports_its_bytes() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let from = dir.path().join("v1/album-art");
        let to = dir.path().join("v2/album-art");
        write(&from.join("a.jpg"), b"1234");
        write(&from.join("nested/b.jpg"), b"567");

        let copied = tree(&from, &to, OnExisting::Skip).expect("copy the tree");

        assert_eq!(copied, 7);
        assert_eq!(std::fs::read(to.join("a.jpg")).expect("read"), b"1234");
        assert_eq!(
            std::fs::read(to.join("nested/b.jpg")).expect("read"),
            b"567"
        );
    }

    /// Resuming an interrupted copy: the entries already present cost nothing,
    /// and the missing one lands. This is the property that makes a 500-file art
    /// cache cheap to retry.
    #[test]
    fn re_running_a_tree_copy_only_moves_what_is_missing() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let from = dir.path().join("v1/album-art");
        let to = dir.path().join("v2/album-art");
        write(&from.join("a.jpg"), b"1234");
        write(&from.join("b.jpg"), b"5678");

        // A previous run got as far as the first file.
        write(&to.join("a.jpg"), b"1234");

        let copied = tree(&from, &to, OnExisting::Skip).expect("resume the copy");

        assert_eq!(copied, 4, "only the missing entry was copied");
        assert!(to.join("b.jpg").exists());
    }

    #[test]
    fn a_missing_source_tree_copies_nothing() {
        let dir = tempfile::tempdir().expect("a temp dir");
        assert_eq!(
            tree(
                &dir.path().join("v1/waveform-peaks"),
                &dir.path().join("v2/waveform-peaks"),
                OnExisting::Skip
            )
            .expect("an absent cache is not an error"),
            0
        );
    }

    /// Following a symlink would copy data from outside the v1 tree into the v2
    /// tree, and a directory link could make the walk run forever.
    #[cfg(unix)]
    #[test]
    fn symlinked_files_and_directories_are_skipped() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let from = dir.path().join("v1/album-art");
        let to = dir.path().join("v2/album-art");
        write(&from.join("real.jpg"), b"1234");

        let outside = dir.path().join("outside.jpg");
        write(&outside, b"not ours");
        std::os::unix::fs::symlink(&outside, from.join("link.jpg")).expect("link a file");
        std::os::unix::fs::symlink(dir.path().join("v1"), from.join("loop")).expect("link a dir");

        let copied = tree(&from, &to, OnExisting::Skip).expect("copy the tree");

        assert_eq!(copied, 4, "only the real file");
        assert!(!to.join("link.jpg").exists());
        assert!(!to.join("loop").exists());
    }
}
