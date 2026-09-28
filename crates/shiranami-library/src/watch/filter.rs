//! Which filesystem events are worth a rescan.
//!
//! The watcher sees everything the OS reports under a library folder: cover
//! art being saved, a `.DS_Store` rewritten, yt-dlp's `.part` file growing a
//! few hundred times a second. Almost none of it is music. This module is the
//! one place that decides, and it decides from the event's *kind*, the file
//! name and what is on disk now, never from the library's contents.
//!
//! # The audio test is the scan's own
//!
//! [`is_audio_file`] is reused rather than restated. A watcher that recognised
//! a different extension set from the scan would either trigger rescans that
//! import nothing or, worse, miss a format the scan would have imported.
//!
//! # Work in progress is not a change
//!
//! Downloaders and copy tools write to a temporary name and rename at the end.
//! Most temporary names already fail the audio test (`song.mp3.part`,
//! `song.ytdl`), but yt-dlp also produces two audio-looking intermediates: the
//! per-format stream it downloads before merging (`song.f251.webm`) and the
//! file ffmpeg writes during post-processing (`song.temp.mp3`). Both are deleted
//! or renamed moments later, so reacting to them would be a rescan racing a
//! file that is about to vanish. The final rename is the event that matters.
//!
//! # A vanished path has no file type
//!
//! A removed directory cannot be stat-ed, and Windows reports a removal without
//! saying what was removed. So a vanished path whose name does not look like a
//! file (see [`looks_like_directory`]) is treated as a removed folder, which is
//! the case that must not be missed: deleting an album folder on Windows emits
//! one event for the folder and none for the files inside it.

use std::path::{Path, PathBuf};

use crate::scan::is_audio_file;

/// Suffixes that mark a file as still being written, compared lowercase.
///
/// The audio test rejects all of these already, because none ends in an audio
/// extension. They are listed anyway so that a removal of one (the downloader
/// renaming `song.mp3.part` to `song.mp3`) is not mistaken for a removed
/// directory by [`looks_like_directory`].
const PARTIAL_SUFFIXES: &[&str] = &[
    ".part",
    ".ytdl",
    ".tmp",
    ".temp",
    ".crdownload",
    ".download",
    ".partial",
];

/// What happened to a path, reduced to what the classifier needs.
///
/// Built from `notify`'s richer `EventKind` by the backend. The backends
/// disagree about renames (FSEvents reports both ends as one ambiguous
/// "name changed" kind, ReadDirectoryChangesW says from and to), so a rename is
/// one kind here and the *existence* of the path says which end it was.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RawKind {
    /// A read or open. Never a change.
    Access,
    /// Something new appeared.
    Create,
    /// Content or metadata changed in place.
    Modify,
    /// Either end of a rename.
    Rename,
    /// Something was removed.
    Remove,
    /// A kind the backend could not name. Treated like [`RawKind::Modify`].
    Other,
}

/// What is at the event's path now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Existence {
    /// A regular file.
    File,
    /// A directory.
    Dir,
    /// Nothing: removed, renamed away, or unreadable.
    Gone,
}

/// A change the coalescer should hear about.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Change {
    /// An audio file was written. Held back until its size stops changing.
    Written(PathBuf),
    /// Something the folder's scan result depends on changed and is already
    /// final: a removal, a folder moved in, a rename.
    Settled,
}

/// Classify one path of one event.
///
/// `None` means "not a library change", which is the answer for the great
/// majority of events a music folder produces.
pub fn classify(kind: RawKind, path: &Path, existence: Existence) -> Option<Change> {
    if kind == RawKind::Access {
        return None;
    }

    let name = path.file_name()?.to_string_lossy();
    if is_partial(&name) {
        return None;
    }

    match existence {
        Existence::File if is_audio_file(&name) => Some(Change::Written(path.to_path_buf())),
        Existence::File => None,
        // A directory's own "modified" is the OS noting that a child changed,
        // and that child gets its own event. Creation and renames are the ones
        // that bring files with them without announcing each (a folder moved in
        // on Windows is a single event).
        Existence::Dir => matches!(kind, RawKind::Create | RawKind::Rename | RawKind::Remove)
            .then_some(Change::Settled),
        Existence::Gone if is_audio_file(&name) || looks_like_directory(&name) => {
            Some(Change::Settled)
        }
        Existence::Gone => None,
    }
}

/// Whether a file name is a download or copy still in progress.
///
/// Matches the suffixes in [`PARTIAL_SUFFIXES`], yt-dlp's fragment files
/// (`song.mp3.part-Frag12`), its post-processing name (`song.temp.mp3`) and its
/// per-format streams (`song.f251.webm`).
pub fn is_partial(name: &str) -> bool {
    let lower = name.to_lowercase();

    if PARTIAL_SUFFIXES
        .iter()
        .any(|suffix| lower.ends_with(suffix))
    {
        return true;
    }
    if lower.contains(".part-frag") {
        return true;
    }

    // The two audio-looking intermediates both put a marker segment directly
    // before the real extension: `<stem>.temp.<ext>` and `<stem>.f<digits>.<ext>`.
    let mut segments = lower.rsplit('.');
    let _extension = segments.next();
    let Some(marker) = segments.next() else {
        return false;
    };
    if segments.next().is_none() {
        // `temp.mp3` is a file called "temp", not a marker on a stem.
        return false;
    }

    marker == "temp"
        || (marker.len() > 1
            && marker.starts_with('f')
            && marker[1..].bytes().all(|byte| byte.is_ascii_digit()))
}

/// Whether a vanished path's name reads as a directory rather than a file.
///
/// A name without a dot is a directory for this purpose, and so is one whose
/// last dot is followed by something no file extension looks like: album
/// folders are named `Vol. 2` or `Live at the B.B.C` far more often than files
/// are named without an extension. The cost of a wrong "yes" is one scoped
/// rescan, and the cost of a wrong "no" is a deleted album staying in the
/// library until the next manual rescan, so the test leans towards "yes".
pub fn looks_like_directory(name: &str) -> bool {
    if is_partial(name) {
        return false;
    }
    let Some(dot) = name.rfind('.') else {
        return true;
    };
    let extension = &name[dot + 1..];

    let file_like = (2..=5).contains(&extension.len())
        && extension.bytes().all(|byte| byte.is_ascii_alphanumeric())
        && extension.bytes().any(|byte| byte.is_ascii_alphabetic());
    !file_like
}

#[cfg(test)]
mod tests {
    use super::*;

    fn written(path: &str) -> Option<Change> {
        Some(Change::Written(PathBuf::from(path)))
    }

    #[test]
    fn a_new_audio_file_is_written_and_everything_else_on_disk_is_not() {
        assert_eq!(
            classify(RawKind::Create, Path::new("/m/a.flac"), Existence::File),
            written("/m/a.flac")
        );
        assert_eq!(
            classify(RawKind::Modify, Path::new("/m/A.MP3"), Existence::File),
            written("/m/A.MP3"),
            "the scan's test is case-insensitive, so this one is too"
        );
        assert_eq!(
            classify(RawKind::Create, Path::new("/m/cover.jpg"), Existence::File),
            None
        );
        assert_eq!(
            classify(RawKind::Modify, Path::new("/m/.DS_Store"), Existence::File),
            None
        );
    }

    #[test]
    fn reads_are_never_changes() {
        assert_eq!(
            classify(RawKind::Access, Path::new("/m/a.mp3"), Existence::File),
            None
        );
    }

    #[test]
    fn downloads_in_progress_are_ignored_at_both_ends() {
        for name in [
            "/m/song.mp3.part",
            "/m/song.ytdl",
            "/m/song.webm.part-Frag12",
            "/m/song.temp.mp3",
            "/m/song.f251.webm",
            "/m/song.m4a.crdownload",
        ] {
            let path = Path::new(name);
            assert_eq!(
                classify(RawKind::Create, path, Existence::File),
                None,
                "{name}"
            );
            assert_eq!(
                classify(RawKind::Remove, path, Existence::Gone),
                None,
                "{name}: the rename away from a partial name is not a removed folder"
            );
        }
    }

    #[test]
    fn a_file_merely_named_like_a_marker_is_still_music() {
        assert!(!is_partial("temp.mp3"));
        assert!(!is_partial("f1.mp3"));
        assert!(!is_partial("Live.at.the.fillmore.mp3"));
        assert!(!is_partial("song.fx.mp3"));
    }

    #[test]
    fn a_removed_audio_file_or_folder_is_settled_and_other_removals_are_not() {
        assert_eq!(
            classify(RawKind::Remove, Path::new("/m/a.ogg"), Existence::Gone),
            Some(Change::Settled)
        );
        assert_eq!(
            classify(RawKind::Rename, Path::new("/m/Album"), Existence::Gone),
            Some(Change::Settled)
        );
        assert_eq!(
            classify(RawKind::Remove, Path::new("/m/Vol. 2"), Existence::Gone),
            Some(Change::Settled)
        );
        assert_eq!(
            classify(RawKind::Remove, Path::new("/m/cover.jpg"), Existence::Gone),
            None
        );
    }

    #[test]
    fn a_folder_arriving_is_settled_but_a_folder_touched_is_not() {
        assert_eq!(
            classify(RawKind::Create, Path::new("/m/Album"), Existence::Dir),
            Some(Change::Settled)
        );
        assert_eq!(
            classify(RawKind::Rename, Path::new("/m/Album"), Existence::Dir),
            Some(Change::Settled)
        );
        assert_eq!(
            classify(RawKind::Modify, Path::new("/m/Album"), Existence::Dir),
            None,
            "a child's own event covers it"
        );
    }

    #[test]
    fn directory_names_are_told_from_file_names() {
        assert!(looks_like_directory("Album"));
        assert!(looks_like_directory("Vol. 2"));
        assert!(looks_like_directory("Live at the B.B.C"));
        assert!(looks_like_directory("2024.06"));
        assert!(!looks_like_directory("cover.jpg"));
        assert!(!looks_like_directory("notes.txt"));
        assert!(!looks_like_directory("song.mp3.part"));
    }
}
