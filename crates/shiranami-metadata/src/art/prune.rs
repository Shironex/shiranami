//! Orphan pruning for the album-art cache.
//!
//! Ported from `pruneOrphanedAlbumArt` in
//! `apps/desktop/src/main/protocols/art-protocol.ts`.
//!
//! The criterion is purely referential — no age, no size ceiling, no LRU, no
//! TTL. A file is an orphan if and only if its name is absent from the set of
//! filenames referenced by `tracks.album_art` and `playlists.cover_art`.
//! Playlist covers are in that set deliberately: "use this track's cover for
//! the playlist" must survive deleting the track it came from.
//!
//! **The reference set arrives through a trait, not a database handle.** This
//! crate sits at the same layer rank as the database crate and may not depend
//! on it, so the dependency is inverted exactly the way `PathAuthority` inverts
//! it for `shiranami-core::paths`. The composition root supplies the impl.
//!
//! # A value this module cannot read is never read as "references nothing"
//!
//! The original port had one fail-safe — an unavailable database skips the
//! prune — and it was not enough. A renderer round-trip wrote loopback URLs
//! (`http://127.0.0.1:<port>/<token>/art/<hash>.jpg`) into `tracks.album_art`,
//! [`file_name_from_url`] answered `None` for every one of them because they
//! are not `shiranami-art://` URLs, and the reference set came out **empty
//! against a full cache**. The prune then did exactly what it is built to do
//! and deleted every cover the user had.
//!
//! The lesson generalises past the bug that taught it: a parse failure and an
//! absence of references are indistinguishable from here, and one of them means
//! destroying data. So every value is now classified rather than filtered —
//! [`Reference::Cached`] names a file, [`Reference::Elsewhere`] provably names
//! none (a remote cover, a `data:` URL), and anything else is
//! [`Reference::Unreadable`] and **aborts the whole pass**. Skipping a prune
//! costs some disk; getting this wrong costs the user's covers.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use shiranami_core::art::{is_loopback_url, loopback_art_file_name};

use crate::art::cache::{art_dir, file_name_from_url};

/// Extensions the cache will delete from.
///
/// v1's `IMAGE_EXTENSIONS`. Anything else in the directory is skipped rather
/// than deleted — a stray `.txt` or a half-written `.tmp` survives forever,
/// which is the safe direction for a pass that runs unattended at boot.
const PRUNABLE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp"];

/// Boxed error type for a reference lookup, mirroring `PathAuthority`'s.
pub type ArtReferencesError = Box<dyn std::error::Error + Send + Sync>;

/// Result alias for [`ArtReferences`].
pub type ArtReferencesResult<T> = std::result::Result<T, ArtReferencesError>;

/// Supplies every `album_art` / `cover_art` value the database currently holds.
///
/// Implemented by the composition root over the database repositories. The
/// values are returned raw — full `shiranami-art://` URLs, `https://` covers
/// and legacy `data:` URLs alike — because deciding which of those name a cache
/// file is this module's job, not the caller's.
pub trait ArtReferences: Send + Sync {
    /// Every non-null `tracks.album_art` value.
    fn track_art(&self) -> ArtReferencesResult<Vec<String>>;
    /// Every non-null `playlists.cover_art` value.
    fn playlist_art(&self) -> ArtReferencesResult<Vec<String>>;
}

/// What one prune pass did.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct PruneReport {
    /// Directory entries examined.
    pub scanned: usize,
    /// Files deleted.
    pub deleted: usize,
    /// Distinct cache filenames the database still refers to.
    pub referenced: usize,
}

/// Delete cache entries nothing refers to.
///
/// Never returns an error and never propagates one. v1 caught a failed database
/// query and returned a zero report rather than pruning against an empty
/// reference set, because "the database is unavailable" and "nothing is
/// referenced" look identical from here and one of them means deleting the
/// user's entire cover cache. That fail-safe is reproduced exactly, and it is
/// the most important line in the module.
pub fn prune_orphans(data_dir: &Path, references: &dyn ArtReferences) -> PruneReport {
    let referenced = match collect_references(references) {
        Ok(Some(referenced)) => referenced,
        Ok(None) => {
            // Skipping is the fail-safe. See the module docs: a value this
            // module cannot classify is not evidence that nothing is
            // referenced, and acting as if it were is how a full cache gets
            // deleted.
            return PruneReport::default();
        }
        Err(error) => {
            tracing::warn!(%error, "album-art prune: reference lookup failed, skipping");
            return PruneReport::default();
        }
    };

    let directory = art_dir(data_dir);
    let entries = match fs::read_dir(&directory) {
        Ok(entries) => entries,
        Err(error) => {
            // A missing directory is the normal state of a fresh install, so
            // this is not warned about at a level the user would ever see.
            tracing::debug!(%error, directory = %directory.display(), "album-art prune: unreadable");
            return PruneReport::default();
        }
    };

    let mut report = PruneReport {
        referenced: referenced.len(),
        ..PruneReport::default()
    };

    for entry in entries.filter_map(std::result::Result::ok) {
        let name = entry.file_name().to_string_lossy().into_owned();
        report.scanned += 1;

        if referenced.contains(&name) || !is_prunable(&name) {
            continue;
        }

        match fs::remove_file(entry.path()) {
            Ok(()) => report.deleted += 1,
            Err(error) => {
                tracing::warn!(%error, entry = %name, "album-art prune: delete failed");
            }
        }
    }

    report
}

/// What one stored art value tells the prune.
#[derive(Debug, PartialEq, Eq)]
enum Reference {
    /// Names a file in the cache.
    Cached(String),
    /// Provably names no cache file: a remote cover, a `data:` URL.
    Elsewhere,
    /// Not a shape this module knows. Never treated as "references nothing".
    Unreadable,
}

/// Schemes whose values are covers the cache does not hold.
///
/// An allowlist rather than "anything with a scheme", because the whole point
/// is that an unrecognised value stops the pass: a list that ended in a
/// catch-all would be the bug this classification exists to prevent, written
/// one layer further in.
const ELSEWHERE_SCHEMES: &[&str] = &["https://", "http://", "data:", "blob:", "file://"];

/// Read one stored `album_art` / `cover_art` value.
fn classify(value: &str) -> Reference {
    if let Some(name) = file_name_from_url(Some(value)) {
        return Reference::Cached(name);
    }

    // A loopback art URL *is* a cache reference — it is the same file, spelled
    // in the form the renderer displays. Recognising it is what keeps a
    // database written before the write guard (or one migration `0007` has not
    // reached yet) from reading as an empty reference set.
    if let Some(name) = loopback_art_file_name(value) {
        tracing::warn!(
            "album-art prune: a non-canonical loopback art URL is stored; counting it as a \
             reference"
        );
        return Reference::Cached(name.to_owned());
    }

    // Any other loopback URL in an art column is a session-scoped address that
    // should never have been persisted, and this module cannot say which file
    // — if any — it meant.
    if is_loopback_url(value) {
        return Reference::Unreadable;
    }

    if ELSEWHERE_SCHEMES
        .iter()
        .any(|scheme| value.starts_with(scheme))
    {
        return Reference::Elsewhere;
    }

    Reference::Unreadable
}

/// Gather the referenced filenames, or `None` if any value could not be read.
///
/// `None` is the fail-safe: the caller must skip the pass entirely rather than
/// prune against a set it knows is incomplete.
fn collect_references(
    references: &dyn ArtReferences,
) -> ArtReferencesResult<Option<HashSet<String>>> {
    let mut referenced = HashSet::new();
    let mut unreadable = 0_usize;

    for value in references
        .track_art()?
        .iter()
        .chain(references.playlist_art()?.iter())
    {
        match classify(value) {
            Reference::Cached(name) => {
                referenced.insert(name);
            }
            Reference::Elsewhere => {}
            // Counted rather than returned early: one pass over the values
            // costs nothing next to the deletions being refused, and the count
            // is the number the log has to carry. The value itself is never
            // logged — a `data:` URL is a whole image and a `file://` one is a
            // path out of the user's library.
            Reference::Unreadable => unreadable += 1,
        }
    }

    if unreadable > 0 {
        tracing::warn!(
            unreadable,
            referenced = referenced.len(),
            "album-art prune: unreadable art values, skipping rather than deleting"
        );
        return Ok(None);
    }

    Ok(Some(referenced))
}

/// Whether a directory entry is one the prune pass is allowed to delete.
fn is_prunable(name: &str) -> bool {
    let Some((_, extension)) = name.rsplit_once('.') else {
        return false;
    };

    PRUNABLE_EXTENSIONS
        .iter()
        .any(|allowed| extension.eq_ignore_ascii_case(allowed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::art::cache::art_url_for;

    struct Fixed {
        tracks: Vec<String>,
        playlists: Vec<String>,
    }

    impl Fixed {
        fn new(tracks: &[&str], playlists: &[&str]) -> Self {
            Self {
                tracks: tracks.iter().map(|value| (*value).to_owned()).collect(),
                playlists: playlists.iter().map(|value| (*value).to_owned()).collect(),
            }
        }
    }

    impl ArtReferences for Fixed {
        fn track_art(&self) -> ArtReferencesResult<Vec<String>> {
            Ok(self.tracks.clone())
        }
        fn playlist_art(&self) -> ArtReferencesResult<Vec<String>> {
            Ok(self.playlists.clone())
        }
    }

    struct Broken;

    impl ArtReferences for Broken {
        fn track_art(&self) -> ArtReferencesResult<Vec<String>> {
            Err("the database is unavailable".into())
        }
        fn playlist_art(&self) -> ArtReferencesResult<Vec<String>> {
            Ok(Vec::new())
        }
    }

    /// Build an art directory holding exactly these filenames.
    fn seed(names: &[&str]) -> tempfile::TempDir {
        let directory = tempfile::tempdir().expect("a temp dir");
        let art = art_dir(directory.path());
        fs::create_dir_all(&art).expect("the art dir is creatable");
        for name in names {
            fs::write(art.join(name), b"bytes").expect("a fixture entry writes");
        }
        directory
    }

    fn entries(directory: &tempfile::TempDir) -> Vec<String> {
        let mut names: Vec<_> = fs::read_dir(art_dir(directory.path()))
            .expect("the art dir exists")
            .filter_map(std::result::Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn an_unreferenced_entry_is_deleted_and_a_referenced_one_survives() {
        let directory = seed(&["keep.jpg", "orphan.jpg", "another.jpg"]);
        let references = Fixed::new(&[&art_url_for("keep.jpg")], &[]);

        let report = prune_orphans(directory.path(), &references);

        assert_eq!(report.deleted, 2);
        assert_eq!(report.referenced, 1);
        assert_eq!(entries(&directory), vec!["keep.jpg"]);
    }

    #[test]
    fn a_cover_referenced_only_by_a_playlist_survives() {
        // v1 pins this: "use suggested cover" must outlive the track it came
        // from, so playlists.cover_art is part of the reference set.
        let directory = seed(&["playlist-cover.jpg", "orphan.jpg"]);
        let references = Fixed::new(&[], &[&art_url_for("playlist-cover.jpg")]);

        prune_orphans(directory.path(), &references);

        assert_eq!(entries(&directory), vec!["playlist-cover.jpg"]);
    }

    #[test]
    fn a_failed_reference_lookup_deletes_nothing() {
        // The single most important behaviour here: an unavailable database
        // must not read as "nothing is referenced".
        let directory = seed(&["a.jpg", "b.jpg"]);

        let report = prune_orphans(directory.path(), &Broken);

        assert_eq!(report, PruneReport::default());
        assert_eq!(entries(&directory), vec!["a.jpg", "b.jpg"]);
    }

    #[test]
    fn remote_and_data_urls_contribute_no_references() {
        // They are legitimate `album_art` values, but they name no cache file,
        // so a cache file that shares nothing with them is still an orphan.
        let directory = seed(&["orphan.jpg"]);
        let references = Fixed::new(
            &["https://example.com/cover.jpg", "data:image/png;base64,AA"],
            &[],
        );

        let report = prune_orphans(directory.path(), &references);

        assert_eq!(report.referenced, 0);
        assert_eq!(report.deleted, 1);
    }

    #[test]
    fn a_non_image_entry_is_skipped_rather_than_deleted() {
        let directory = seed(&["notes.txt", "orphan.jpg", "half-written.tmp"]);

        let report = prune_orphans(directory.path(), &Fixed::new(&[], &[]));

        assert_eq!(report.scanned, 3);
        assert_eq!(report.deleted, 1);
        assert_eq!(entries(&directory), vec!["half-written.tmp", "notes.txt"]);
    }

    #[test]
    fn a_reference_to_a_missing_file_is_not_an_error() {
        let directory = seed(&[]);
        let references = Fixed::new(&[&art_url_for("never-existed.jpg")], &[]);

        let report = prune_orphans(directory.path(), &references);

        assert_eq!(report.referenced, 1);
        assert_eq!(report.deleted, 0);
    }

    #[test]
    fn a_missing_cache_directory_is_a_no_op() {
        let directory = tempfile::tempdir().expect("a temp dir");

        assert_eq!(
            prune_orphans(directory.path(), &Fixed::new(&[], &[])),
            PruneReport::default()
        );
    }

    /// The regression this whole classification exists for.
    ///
    /// The renderer round-tripped `http://127.0.0.1:<port>/<token>/art/…` into
    /// `tracks.album_art`; `file_name_from_url` answered `None` for every row,
    /// the reference set came out empty against a full cache, and the boot
    /// prune deleted 512 covers. The loopback form now resolves to the file it
    /// names, so the cache survives even before migration `0007` reaches it.
    #[test]
    fn a_loopback_art_url_counts_as_a_reference_rather_than_as_nothing() {
        let directory = seed(&["keep.jpg", "orphan.jpg"]);
        let references = Fixed::new(
            &["http://127.0.0.1:60241/9f8e7d6c/art/keep.jpg"],
            &["http://localhost:60241/9f8e7d6c/art/keep.jpg"],
        );

        let report = prune_orphans(directory.path(), &references);

        assert_eq!(report.referenced, 1);
        assert_eq!(report.deleted, 1);
        assert_eq!(entries(&directory), vec!["keep.jpg"]);
    }

    /// The generalisation: **any** value this module cannot read stops the
    /// pass. A parse failure is not evidence of an unreferenced file.
    #[test]
    fn an_unreadable_value_deletes_nothing_at_all() {
        for corrupt in [
            // A loopback URL for another route: session-scoped, and this module
            // cannot say which file it meant.
            "http://127.0.0.1:60241/9f8e7d6c/audio?path=%2Fmusic%2Fa.mp3",
            // A `shiranami-art://` URL with no file name.
            "shiranami-art://art/",
            // A scheme nothing in the app writes.
            "shiranami-cover://art/x.jpg",
            // A bare filename, which looks like a reference and is not one this
            // module is willing to guess at.
            "abc123.jpg",
            // Empty, which a `NOT NULL`-less column can still hold.
            "",
        ] {
            let directory = seed(&["a.jpg", "b.jpg"]);
            let references = Fixed::new(&[&art_url_for("a.jpg"), corrupt], &[]);

            let report = prune_orphans(directory.path(), &references);

            assert_eq!(
                report,
                PruneReport::default(),
                "{corrupt} did not stop the prune"
            );
            assert_eq!(
                entries(&directory),
                vec!["a.jpg", "b.jpg"],
                "{corrupt} cost the user a file"
            );
        }
    }

    /// One unreadable value among many good ones is still enough to stop it:
    /// the pass is all-or-nothing, because a partial reference set is exactly
    /// what deletes live files.
    #[test]
    fn one_unreadable_value_stops_a_pass_full_of_readable_ones() {
        let directory = seed(&["keep.jpg", "orphan.jpg"]);
        let references = Fixed::new(
            &[
                &art_url_for("keep.jpg"),
                "https://example.com/cover.jpg",
                "not a url",
            ],
            &[],
        );

        prune_orphans(directory.path(), &references);

        assert_eq!(entries(&directory), vec!["keep.jpg", "orphan.jpg"]);
    }

    #[test]
    fn the_classifier_reads_each_shape_the_column_holds() {
        assert_eq!(
            classify(&art_url_for("x.jpg")),
            Reference::Cached("x.jpg".to_owned())
        );
        assert_eq!(
            classify("http://127.0.0.1:1/t/art/x.jpg"),
            Reference::Cached("x.jpg".to_owned())
        );
        assert_eq!(
            classify("https://example.com/cover.jpg"),
            Reference::Elsewhere
        );
        assert_eq!(classify("data:image/png;base64,AA"), Reference::Elsewhere);
        assert_eq!(classify("who knows"), Reference::Unreadable);
    }

    #[test]
    fn every_prunable_extension_is_recognised_case_insensitively() {
        for extension in PRUNABLE_EXTENSIONS {
            assert!(is_prunable(&format!("a.{extension}")));
            assert!(is_prunable(&format!("a.{}", extension.to_uppercase())));
        }
        assert!(!is_prunable("a.txt"));
        assert!(!is_prunable("no-extension"));
    }
}
