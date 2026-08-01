//! Tag writing that cannot leave a half-written audio file behind.
//!
//! # Why this exists
//!
//! v1 wrote tags three different ways, and only one of them was safe.
//!
//! - **mp3**, via node-id3: `readFileSync` the whole file, rebuild the tag,
//!   `writeFileSync` over the original path. Synchronous, in place, no temp, no
//!   backup — and on the Electron main thread.
//! - **flac**, via flac-tagger: `readFile` then `writeFile` to the same path.
//!   Same shape.
//! - **m4a/ogg/opus/aac/wma/webm**, via an ffmpeg remux: written to
//!   `<name>.<timestamp>.tmp<ext>` in the same directory, then `rename`d over
//!   the original — correct, and the only branch that was.
//!
//! A crash, a full disk, or a power cut during either of the first two leaves
//! the user with a truncated audio file and no copy of the original. That is
//! not a theoretical risk for a tag editor that runs over a whole library.
//!
//! v2 routes **every** format through the ffmpeg branch's shape: copy to a
//! sibling temp, tag the copy, rename over the original. The original file is
//! untouched until a single atomic `rename`, so any failure leaves it exactly
//! as it was. This is the same discipline as `shiranami-core`'s
//! `store::atomic::write_atomic`, applied to a file we do not own the contents
//! of.

use std::fs;
use std::path::{Path, PathBuf};

use lofty::config::WriteOptions;
use lofty::file::TaggedFileExt;
use lofty::prelude::TagExt;
use lofty::tag::{Tag, TagType};

use crate::error::{MetadataError, Result};
use crate::write::options::{WriteOutcome, WriteTagsOptions};

/// Apply tag edits to `path`, saving any cover into the art cache.
///
/// `data_dir` is the app data directory; pass `None` to embed the cover in the
/// file without caching a copy.
///
/// Returns without touching the file when `options` changes nothing, matching
/// v1's early return — which matters more here, since a write means copying the
/// whole file.
pub fn write_tags(
    path: &Path,
    options: &WriteTagsOptions,
    data_dir: Option<&Path>,
) -> Result<WriteOutcome> {
    // The cache write happens first, exactly as v1 ordered it, so the caller
    // gets a usable `album_art_url` even if the file write then fails. The two
    // are independent: the cache is keyed by content, not by which track
    // referenced it.
    let album_art_url = match (data_dir, &options.cover) {
        (Some(data_dir), Some(cover)) => crate::art::save_cover(data_dir, cover)?,
        _ => None,
    };

    if options.is_empty() {
        return Ok(WriteOutcome { album_art_url });
    }

    let guard = TempCopy::beside(path)?;
    apply_to_file(guard.path(), options)?;
    guard.commit(path)?;

    Ok(WriteOutcome { album_art_url })
}

/// Read the temp copy's tags, edit them, and save them back into it.
fn apply_to_file(temp: &Path, options: &WriteTagsOptions) -> Result<()> {
    let mut tagged =
        lofty::read_from_path(temp).map_err(|error| MetadataError::tag(temp, error))?;

    let tag_type = tagged
        .primary_tag()
        .map(Tag::tag_type)
        // A file with no tag at all still needs one to write into, and the
        // container decides which kind it can hold: ID3v2 for MPEG and WAV,
        // Vorbis comments for FLAC and Ogg, an `ilst` for MP4.
        .or_else(|| tagged.first_tag().map(Tag::tag_type))
        .unwrap_or_else(|| tagged.file_type().primary_tag_type());

    let mut tag = tagged
        .remove(tag_type)
        // Read-modify-write: start from what the file has, so untouched frames
        // survive.
        .unwrap_or_else(|| Tag::new(tag_type));

    crate::write::tags::apply(&mut tag, options);

    tag.save_to_path(temp, WriteOptions::default())
        .map_err(|error| unsupported_or_tag_error(temp, tag_type, &error))?;

    Ok(())
}

/// Distinguish "this container cannot hold tags" from "the write failed".
///
/// v1 answered `success: true` for a `.wav` it never wrote and let the database
/// drift away from the file permanently. v2 reports it, so the caller can tell
/// the user something true.
fn unsupported_or_tag_error(
    path: &Path,
    tag_type: TagType,
    error: &lofty::error::LoftyError,
) -> MetadataError {
    if matches!(error.kind(), lofty::error::ErrorKind::UnsupportedTag) {
        return MetadataError::UnsupportedForWriting {
            path: path.to_path_buf(),
            format: format!("{tag_type:?}"),
        };
    }
    MetadataError::tag(path, error)
}

/// A copy of a file, in the same directory, removed on drop unless committed.
///
/// Same directory and not the system temp dir: `rename` is only atomic within a
/// filesystem, and a music library on an external drive would otherwise get a
/// copy-and-delete that is not.
struct TempCopy {
    path: PathBuf,
    committed: bool,
}

impl TempCopy {
    fn beside(original: &Path) -> Result<Self> {
        let directory = original.parent().unwrap_or_else(|| Path::new("."));
        let stem = original
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "track".to_owned());
        let extension = original
            .extension()
            .map(|extension| format!(".{}", extension.to_string_lossy()))
            .unwrap_or_default();

        // The extension is preserved because `lofty` uses it as a probe hint,
        // and the pid/nanos suffix keeps two concurrent writes to the same file
        // from colliding on the temp name.
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let path = directory.join(format!(
            ".{stem}.{}.{unique}.tmp{extension}",
            std::process::id()
        ));

        fs::copy(original, &path)
            .map_err(|source| MetadataError::io("copy for a safe tag write", original, source))?;

        Ok(Self {
            path,
            committed: false,
        })
    }

    fn path(&self) -> &Path {
        &self.path
    }

    /// Replace `original` with the temp copy.
    fn commit(mut self, original: &Path) -> Result<()> {
        // `sync_data` before the rename: without it a crash right after can
        // leave the rename durable but the contents not, which is the one way
        // temp-and-rename still loses data.
        if let Ok(file) = fs::File::open(&self.path) {
            let _ = file.sync_data();
        }

        fs::rename(&self.path, original)
            .map_err(|source| MetadataError::io("replace after a tag write", original, source))?;
        self.committed = true;
        Ok(())
    }
}

impl Drop for TempCopy {
    fn drop(&mut self) {
        if !self.committed {
            // Best effort: the original is already intact, so a leftover temp
            // is untidy rather than dangerous.
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::write::options::FieldEdit;

    #[test]
    fn a_failed_write_leaves_the_original_byte_for_byte_intact() {
        // The reason this module exists. The file is not a valid container, so
        // `apply_to_file` fails after the temp copy has been made.
        let directory = tempfile::tempdir().expect("a temp dir");
        let path = directory.path().join("song.mp3");
        let original = b"not a real mpeg file, but the user's bytes all the same";
        fs::write(&path, original).expect("the fixture writes");

        let error = write_tags(
            &path,
            &WriteTagsOptions {
                title: FieldEdit::Set("New".to_owned()),
                ..Default::default()
            },
            None,
        )
        .expect_err("an unreadable container cannot be tagged");

        assert!(matches!(error, MetadataError::Tag { .. }), "got {error:?}");
        assert_eq!(
            fs::read(&path).expect("the original is still there"),
            original,
            "v1 would have truncated this file"
        );
    }

    #[test]
    fn a_failed_write_leaves_no_temp_file_behind() {
        let directory = tempfile::tempdir().expect("a temp dir");
        let path = directory.path().join("song.mp3");
        fs::write(&path, b"not a real mpeg file").expect("the fixture writes");

        let _ = write_tags(
            &path,
            &WriteTagsOptions {
                title: FieldEdit::Set("New".to_owned()),
                ..Default::default()
            },
            None,
        );

        let entries: Vec<_> = fs::read_dir(directory.path())
            .expect("the dir exists")
            .filter_map(std::result::Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(entries, vec!["song.mp3".to_owned()]);
    }

    #[test]
    fn an_empty_edit_does_not_touch_the_file() {
        let directory = tempfile::tempdir().expect("a temp dir");
        let path = directory.path().join("song.mp3");
        fs::write(&path, b"untouched").expect("the fixture writes");

        let outcome = write_tags(&path, &WriteTagsOptions::default(), None)
            .expect("an empty edit is not an error");

        assert_eq!(outcome, WriteOutcome::default());
        assert_eq!(fs::read(&path).expect("readable"), b"untouched");
    }

    #[test]
    fn the_temp_copy_sits_beside_the_original() {
        // Cross-filesystem renames are not atomic, so the temp must share the
        // original's directory rather than live in the system temp dir.
        let directory = tempfile::tempdir().expect("a temp dir");
        let path = directory.path().join("song.mp3");
        fs::write(&path, b"bytes").expect("the fixture writes");

        let guard = TempCopy::beside(&path).expect("the copy is made");

        assert_eq!(guard.path().parent(), path.parent());
        assert_eq!(fs::read(guard.path()).expect("readable"), b"bytes");
    }

    #[test]
    fn an_uncommitted_temp_copy_is_removed_on_drop() {
        let directory = tempfile::tempdir().expect("a temp dir");
        let path = directory.path().join("song.mp3");
        fs::write(&path, b"bytes").expect("the fixture writes");

        let temp_path = {
            let guard = TempCopy::beside(&path).expect("the copy is made");
            guard.path().to_path_buf()
        };

        assert!(!temp_path.exists());
    }
}
