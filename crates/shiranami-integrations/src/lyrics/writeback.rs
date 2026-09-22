//! Keeping what the directory answered: the `.lrc` sidecar write.
//!
//! Shiranami is local-first everywhere except here — lyrics fetched from LRCLIB
//! lived in a 200-entry in-memory MRU and nowhere else, so losing the network
//! lost them. This module closes that: a synced hit is written to a `.lrc` file
//! beside the track, and [`crate::lyrics::local`]'s existing precedence ladder
//! finds it on the next play with no new read path.
//!
//! # Every rule here is a refusal
//!
//! Writing into a music library is the most destructive thing this app does, and
//! all five guards below exist to *not* do it:
//!
//! - **Opt-in.** [`crate::lyrics::LyricsPolicy::should_save_fetched_lyrics`]
//!   defaults to `false` on the trait itself, so a policy that has never heard
//!   of write-back is a policy that does not write.
//! - **Containment.** The destination is *derived* from the track's own path and
//!   never accepted from a caller, and the track's directory is then put to
//!   [`crate::lyrics::LyricsPolicy::is_lyrics_write_allowed`], which also
//!   defaults closed.
//! - **Never overwrite, and never shadow.** Any lyric file already sitting in
//!   one of the reader's six locations is the user's own and wins outright —
//!   see [`crate::lyrics::local::existing_lyric_sidecar`]. A `.txt` counts too
//!   unless the user has set `lyrics.preferSyncedFromLrclib`, because a fresh
//!   `.lrc` outranks a `.txt` everywhere in the ladder and retires it as
//!   thoroughly as an overwrite would; [`crate::lyrics::local::SidecarGuard`]
//!   carries that decision in from the caller that knows the setting.
//! - **Read-only is normal, not exceptional.** NAS shares and deliberately
//!   read-only folders are ordinary places to keep music. A failed write is a
//!   `debug` line and [`SidecarOutcome::Failed`]; the lyrics still reach the
//!   renderer from memory exactly as they did before this module existed.
//! - **Atomic.** Temp file, `sync_data`, rename — the pattern
//!   `shiranami_core::store::atomic` documents, so a reader mid-write sees the
//!   old file or the new one and never a torn one.
//!
//! # Why the write is not `shiranami_core::store::atomic::write_atomic`
//!
//! That function creates its temp file `0600` on Unix, because the file it was
//! written for holds a Last.fm session key. A lyric file is the opposite kind of
//! object: it lives in the user's music folder beside tracks their other players
//! and their household read, and a library that suddenly grew owner-only lyric
//! files would be a bug reported as one. The sequence is the same; the mode is
//! deliberately the process umask's.
//!
//! # `create_new`, not `create`
//!
//! The final step is a rename, which *does* clobber. The existence check above
//! it is therefore advisory — a `.lrc` appearing between the check and the
//! rename would be overwritten. Nothing in this app writes lyric files
//! concurrently, but "the user dropped a file in while a library batch ran" is a
//! real sequence, so the rename is preceded by one last [`Path::try_exists`] and
//! the temp file itself is opened `create_new`, which makes a temp-name
//! collision a failure rather than a silent truncation of somebody else's file.

use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

use crate::lyrics::local::{SidecarGuard, existing_lyric_sidecar};

/// What one write-back attempt did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SidecarOutcome {
    /// The file was written. Carries the path, for the log line and the batch.
    Written(PathBuf),
    /// Nothing was written, for a reason that is not a failure.
    Skipped(SidecarSkip),
    /// The write was attempted and the filesystem refused.
    ///
    /// Deliberately carries no error: every caller's response is the same
    /// (count it and carry on), the detail is already in the log line, and a
    /// `std::io::Error` here would make the outcome neither `Clone` nor `Eq`
    /// for the sake of information nobody reads.
    Failed,
}

/// Why a write-back did not happen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidecarSkip {
    /// The user has not opted in.
    Disabled,
    /// A stream, or a track whose path has no parent or no basename — there is
    /// no "beside the file" to write to.
    NoDestination,
    /// The track's folder is not one the app may write into.
    NotAllowed,
    /// A lyric file is already there. It is the user's, and it wins.
    AlreadyExists,
    /// The directory answered, but with no timed lyrics to save.
    NotSynced,
}

/// The sidecar this track's lyrics would be written to.
///
/// Sibling and same basename — the first entry of the reader's candidate list,
/// so a file written here is found first on the next play. Built by
/// concatenation rather than [`Path::with_extension`] for the reason
/// [`crate::lyrics::local`] spells out: `with_extension` reads the stem of
/// `Song. Pt. 2.mp3` as carrying an extension already and would produce
/// `Song. Pt.lrc`.
///
/// `None` when the path has no parent or no basename, which is what makes a
/// radio pseudo-path unwritable rather than merely unlikely.
pub fn sidecar_path(audio_file: &Path) -> Option<PathBuf> {
    let directory = audio_file.parent()?;
    let stem = audio_file.file_stem()?;
    if stem.is_empty() {
        return None;
    }

    let mut name = stem.to_os_string();
    name.push(".lrc");
    Some(directory.join(name))
}

/// Write `lrc` beside `audio_file`, unless one of the guards says not to.
///
/// `guard` decides which files the user is deemed to already have; the caller
/// owns that decision because it is the one holding the
/// `lyrics.preferSyncedFromLrclib` answer. See [`SidecarGuard`].
///
/// `lrc` is written **verbatim**: the bytes LRCLIB published, timing lines and
/// all. Never returns an error — see the module docs on why a read-only library
/// is an ordinary configuration rather than a failure to report.
///
/// The filesystem work runs on the blocking pool (architecture §2.3), so this
/// does not stall the async worker the fetch is running on.
pub async fn save_synced_sidecar(
    audio_file: &Path,
    lrc: &str,
    guard: SidecarGuard,
) -> SidecarOutcome {
    let Some(destination) = sidecar_path(audio_file) else {
        return SidecarOutcome::Skipped(SidecarSkip::NoDestination);
    };

    let audio_file = audio_file.to_path_buf();
    let contents = lrc.to_owned();

    match tokio::task::spawn_blocking(move || {
        write_sidecar(&audio_file, &destination, &contents, guard)
    })
    .await
    {
        Ok(outcome) => outcome,
        Err(error) => {
            tracing::warn!(%error, "lyric sidecar write panicked");
            SidecarOutcome::Failed
        }
    }
}

/// The blocking half: the existence check, the temp file, the rename.
fn write_sidecar(
    audio_file: &Path,
    destination: &Path,
    lrc: &str,
    guard: SidecarGuard,
) -> SidecarOutcome {
    if let Some(existing) = existing_lyric_sidecar(audio_file, guard) {
        tracing::debug!(
            existing = %existing.display(),
            "a lyric file is already there; leaving it alone"
        );
        return SidecarOutcome::Skipped(SidecarSkip::AlreadyExists);
    }

    match write_atomic_beside(destination, lrc.as_bytes()) {
        Ok(()) => {
            tracing::info!(sidecar = %destination.display(), "saved fetched lyrics");
            SidecarOutcome::Written(destination.to_path_buf())
        }
        Err(error) => {
            // `debug`, not `warn`: a read-only music folder is a configuration,
            // not a fault, and a library-wide batch over one would otherwise
            // fill the shipped log with thousands of identical warnings.
            tracing::debug!(
                sidecar = %destination.display(),
                %error,
                "could not save fetched lyrics; keeping them in memory only"
            );
            SidecarOutcome::Failed
        }
    }
}

/// Temp file, flush, rename — at the umask's mode rather than owner-only.
///
/// See the module docs for why this is not `store::atomic::write_atomic`.
fn write_atomic_beside(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let temp = temp_path(path);

    let write_then_rename = || -> std::io::Result<()> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(bytes)?;
        file.sync_data()?;
        drop(file);

        // The last-moment re-check described in the module docs. `rename`
        // clobbers, and this is the only thing standing between a file the user
        // dropped in mid-batch and losing it.
        if path.try_exists().unwrap_or(true) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                "a lyric file appeared at the destination while it was being written",
            ));
        }

        std::fs::rename(&temp, path)
    };

    let result = write_then_rename();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

/// Where `destination` is staged before the rename.
///
/// **The name is kept short on purpose.** Windows refuses a path over 260
/// characters unless long paths are enabled, and a routine
/// `Artist/Album/Disc 2/NN - Long Title.flac` layout puts the `.lrc`
/// destination within a couple of dozen characters of that ceiling. The store's
/// `pid` + 19-digit nanosecond stamp would add ~31 characters *over the
/// destination*, so a library that can hold the file cannot hold the temp file
/// it is written through — `create_new` fails with `ERROR_FILENAME_EXCED_RANGE`
/// and the user sees an unexplained `failed` count. Hex pid plus a run-local
/// counter costs about a dozen.
///
/// It is no less unique for the shortening. Two live processes never share a
/// pid, and within one process the counter never repeats, so the only collision
/// left is a temp file orphaned by a crash of an earlier process whose pid has
/// since been recycled — which `create_new` turns into a refused write rather
/// than a truncation of somebody else's file.
fn temp_path(destination: &Path) -> PathBuf {
    static SEQUENCE: AtomicU32 = AtomicU32::new(0);

    let directory = destination.parent().unwrap_or_else(|| Path::new("."));
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("lyrics");

    let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
    directory.join(format!(
        ".{file_name}.{:x}-{sequence:x}.tmp",
        std::process::id()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const LRC: &str = "[00:01.00]One\n[00:02.50]Two\n";

    fn temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().expect("a temp dir")
    }

    #[test]
    fn the_destination_is_a_sibling_sharing_the_basename() {
        let path = sidecar_path(Path::new("/music/Album/Song.mp3")).expect("a destination");
        assert_eq!(path, Path::new("/music/Album/Song.lrc"));
    }

    /// The same dotted-title trap `local::candidate_paths` documents: a
    /// `with_extension` here would aim at `Song. Pt.lrc`, which the reader would
    /// never look for.
    #[test]
    fn only_the_final_extension_is_replaced() {
        let path = sidecar_path(Path::new("/music/Song. Pt. 2.flac")).expect("a destination");
        assert_eq!(
            path.file_name(),
            Some(std::ffi::OsStr::new("Song. Pt. 2.lrc"))
        );
    }

    /// A radio pseudo-path is the case this closes: there is no file to write
    /// beside, and inventing one would put a `.lrc` somewhere arbitrary.
    #[test]
    fn a_path_with_no_basename_has_no_destination() {
        assert_eq!(sidecar_path(Path::new("/")), None);
    }

    #[tokio::test]
    async fn writes_the_document_byte_for_byte() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");

        let outcome = save_synced_sidecar(&audio, LRC, SidecarGuard::AnyLyricFile).await;

        let written = dir.path().join("Song.lrc");
        assert_eq!(outcome, SidecarOutcome::Written(written.clone()));
        assert_eq!(fs::read_to_string(&written).expect("read it back"), LRC);
    }

    /// The whole point of carrying the raw document: CRLF, stacked timestamps
    /// and three-digit fractions survive, because nothing re-renders them.
    #[tokio::test]
    async fn the_original_timing_lines_are_preserved_exactly() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        let original = "[00:02.030][00:01.00]Refrain\r\n[03:04.5]not a line\r\n";

        save_synced_sidecar(&audio, original, SidecarGuard::AnyLyricFile).await;

        assert_eq!(
            fs::read_to_string(dir.path().join("Song.lrc")).expect("read it back"),
            original
        );
    }

    /// The non-negotiable one. The user's file is the user's file.
    #[tokio::test]
    async fn an_existing_sidecar_is_never_overwritten() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        let sidecar = dir.path().join("Song.lrc");
        fs::write(&sidecar, "[00:09.00]Mine, hand-timed").expect("seed the user's file");

        let outcome = save_synced_sidecar(&audio, LRC, SidecarGuard::AnyLyricFile).await;

        assert_eq!(outcome, SidecarOutcome::Skipped(SidecarSkip::AlreadyExists));
        assert_eq!(
            fs::read_to_string(&sidecar).expect("read it back"),
            "[00:09.00]Mine, hand-timed"
        );
    }

    /// …including one filed under `Lyrics/`. A fresh sibling would outrank it in
    /// the reader's ladder, which shadows the user's file as surely as
    /// overwriting it.
    #[tokio::test]
    async fn a_sidecar_in_a_lyrics_subfolder_also_wins() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        let subfolder = dir.path().join("Lyrics");
        fs::create_dir_all(&subfolder).expect("create the subfolder");
        fs::write(subfolder.join("Song.lrc"), "[00:09.00]Mine").expect("seed the user's file");

        let outcome = save_synced_sidecar(&audio, LRC, SidecarGuard::AnyLyricFile).await;

        assert_eq!(outcome, SidecarOutcome::Skipped(SidecarSkip::AlreadyExists));
        assert!(
            !dir.path().join("Song.lrc").exists(),
            "no sibling may appear above the user's own file"
        );
    }

    /// A `.txt` blocks by default. A fresh `Song.lrc` outranks `Song.txt`
    /// everywhere in the reader's ladder, so writing one retires the file the
    /// user typed out — and the shipped copy promises it will not.
    #[tokio::test]
    async fn a_plain_text_sidecar_blocks_the_write_by_default() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        fs::write(dir.path().join("Song.txt"), "Just words").expect("seed a txt");

        let outcome = save_synced_sidecar(&audio, LRC, SidecarGuard::AnyLyricFile).await;

        assert_eq!(outcome, SidecarOutcome::Skipped(SidecarSkip::AlreadyExists));
        assert!(
            !dir.path().join("Song.lrc").exists(),
            "the user's plain text must not be shadowed by a fetched file"
        );
    }

    /// …and stops blocking exactly when the user asks for it to. That is what
    /// `lyrics.preferSyncedFromLrclib` means: timings from the directory are
    /// wanted over plain text already on disk.
    #[tokio::test]
    async fn a_plain_text_sidecar_yields_when_the_user_prefers_lrclib_timings() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        fs::write(dir.path().join("Song.txt"), "Just words").expect("seed a txt");

        let outcome = save_synced_sidecar(&audio, LRC, SidecarGuard::TimedOnly).await;

        assert!(matches!(outcome, SidecarOutcome::Written(_)));
        assert_eq!(
            fs::read_to_string(dir.path().join("Song.txt")).expect("read it back"),
            "Just words",
            "and the `.txt` itself is still never touched"
        );
    }

    /// The read-only-library contract: a refused write is an outcome, never an
    /// error and never a panic. A directory at the destination refuses the
    /// rename on every platform, which is the portable way to force it.
    #[tokio::test]
    async fn a_refused_write_degrades_quietly() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        fs::create_dir(dir.path().join("Song.lrc")).expect("create the blocking directory");

        // The existence check sees the directory first, so this is a skip rather
        // than a failure — either way nothing is written and nothing is thrown.
        let outcome = save_synced_sidecar(&audio, LRC, SidecarGuard::AnyLyricFile).await;
        assert!(matches!(outcome, SidecarOutcome::Skipped(_)));
    }

    /// A write into a folder that does not exist is the NAS-gone-away shape:
    /// refused by the filesystem, counted, and carried on from.
    #[tokio::test]
    async fn a_missing_directory_is_a_failure_and_not_a_panic() {
        let dir = temp_dir();
        let audio = dir.path().join("nowhere").join("Song.mp3");

        assert_eq!(
            save_synced_sidecar(&audio, LRC, SidecarGuard::AnyLyricFile).await,
            SidecarOutcome::Failed
        );
    }

    /// A failed write must leave no `.Song.lrc.<pid>-<n>.tmp` litter in the
    /// user's music folder.
    #[tokio::test]
    async fn a_failed_write_leaves_no_temp_file_behind() {
        let dir = temp_dir();
        // Occupy the destination *after* the existence check would have run, by
        // driving the inner writer directly.
        let destination = dir.path().join("Song.lrc");
        fs::create_dir(&destination).expect("block the rename");

        assert!(write_atomic_beside(&destination, LRC.as_bytes()).is_err());

        let leftovers: Vec<String> = fs::read_dir(dir.path())
            .expect("read the folder")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "temp litter left behind: {leftovers:?}"
        );
    }

    /// The MAX_PATH guard. A destination the filesystem can hold must not be
    /// staged through a name it cannot: on Windows a deep
    /// `Artist/Album/Disc 2/NN - Title.lrc` sits close enough to 260 characters
    /// that a long temp suffix is the difference between a saved lyric and an
    /// unexplained `failed` count.
    #[test]
    fn the_temp_name_stays_close_to_the_destination_it_stages() {
        let destination = Path::new("/music/Artist/Album/Disc 2/07 - A Long Title.lrc");
        let temp = temp_path(destination);

        let length = |path: &Path| path.as_os_str().len();
        let overhead = length(&temp) - length(destination);
        assert!(
            overhead <= 20,
            "the temp path is {overhead} characters longer than the destination: {}",
            temp.display()
        );
        assert_eq!(temp.parent(), destination.parent());
    }

    /// …and it is still distinct per attempt, or `create_new` would start
    /// refusing writes that have nothing wrong with them.
    #[test]
    fn two_temp_names_for_one_destination_differ() {
        let destination = Path::new("/music/Song.lrc");
        assert_ne!(temp_path(destination), temp_path(destination));
    }
}
