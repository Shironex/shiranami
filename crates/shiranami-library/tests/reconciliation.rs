//! The new / changed / moved / deleted matrix, against a real database.
//!
//! `shiranami-library` writes no rows — the renderer does, and this file
//! reproduces the renderer's reconciliation so the *whole* behaviour is
//! executable in one place instead of split between a Rust crate that only
//! scans and a TypeScript hook nobody runs in CI.
//!
//! [`reconcile`] is a line-for-line port of `scanAndPersistFolder`
//! (`apps/web/src/lib/scanHelpers.ts:29-90`) and [`sweep_missing`] of the
//! validation half of `useLibraryRescan.rescan` (`useLibraryRescan.ts:91-106`).
//! Neither belongs in the crate; both belong in a test that documents what a
//! scan actually causes.
//!
//! # What the matrix turns out to be
//!
//! File identity is the absolute path string, and nothing else. There is no
//! mtime comparison, no size comparison, no content hash. So:
//!
//! | Case    | v1 behaviour                                              |
//! | ------- | --------------------------------------------------------- |
//! | new     | inserted with a fresh UUID                                 |
//! | changed | **not detected** — an existing path is never re-read       |
//! | moved   | insert at the new path + delete at the old; identity lost  |
//! | deleted | hard-deleted once `validate-files` reports the path gone   |
//!
//! The moved row is the one worth reading twice. `play_count`, `is_favorite`,
//! `loudness_lufs`, `created_at` and the row's `id` are all reset, and every
//! playlist entry and history row keyed on the old id is cascaded away. That is
//! v1's behaviour, it is preserved, and these tests exist so that the day
//! somebody implements move detection they find out immediately which
//! assertions they are changing.

#[path = "support/tree.rs"]
mod tree;

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use shiranami_core::models::TrackCreateInput;
use shiranami_db::repo::tracks;
use shiranami_library::scan::{ScannedFile, ignore_progress, scan_folder};
use shiranami_library::validate_files;
use sqlx::SqliteConnection;
use sqlx::pool::PoolConnection;
use tempfile::TempDir;
use tokio_util::sync::CancellationToken;

/// A fixture database plus the single connection every call borrows.
///
/// The pool holds exactly one connection, so acquiring twice would hang rather
/// than fail — the fixture acquires once and hands out `&mut` borrows, which is
/// the arrangement `shiranami-db`'s own tests use.
struct Library {
    _dir: TempDir,
    connection: PoolConnection<sqlx::Sqlite>,
}

impl Library {
    async fn fresh() -> Self {
        let dir = tempfile::tempdir().expect("a temp dir");
        let opened = shiranami_db::open(&dir.path().join("shiranami.db"))
            .await
            .expect("the fixture database opens");
        let connection = opened.pool.acquire().await.expect("the one connection");

        Self {
            _dir: dir,
            connection,
        }
    }

    fn conn(&mut self) -> &mut SqliteConnection {
        &mut self.connection
    }
}

fn text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// `scanAndPersistFolder`'s persistence half: filter by path, then insert.
///
/// Returns how many rows actually landed, which is what the renderer reports as
/// `addedCount`.
async fn reconcile(conn: &mut SqliteConnection, scanned: &[ScannedFile]) -> usize {
    if scanned.is_empty() {
        return 0;
    }

    let paths: Vec<String> = scanned.iter().map(|file| text(&file.file_path)).collect();
    let existing: HashSet<String> = tracks::exists_many(conn, &paths)
        .await
        .expect("the existence check runs")
        .into_iter()
        .collect();

    let genuinely_new: Vec<TrackCreateInput> = scanned
        .iter()
        .filter(|file| !existing.contains(&text(&file.file_path)))
        .map(|file| TrackCreateInput {
            file_path: text(&file.file_path),
            title: file.metadata.title.clone(),
            artist: Some(file.metadata.artist.clone()),
            album_artist: file.metadata.album_artist.clone(),
            album: Some(file.metadata.album.clone()),
            duration: Some(file.metadata.duration),
            genre: Some(file.metadata.genre.clone()),
            year: file.metadata.year,
            track_number: file.metadata.track_number,
            disc_number: file.metadata.disc_number,
            album_art: file.metadata.album_art.clone(),
        })
        .collect();

    if genuinely_new.is_empty() {
        return 0;
    }

    tracks::add_many(conn, &genuinely_new)
        .await
        .expect("the import runs")
        .len()
}

/// The validation half of `useLibraryRescan.rescan`: flag, map to ids, delete.
async fn sweep_missing(conn: &mut SqliteConnection) -> usize {
    let library = tracks::get_all(conn).await.expect("the library reads");
    let paths: Vec<PathBuf> = library
        .iter()
        .map(|track| PathBuf::from(&track.file_path))
        .collect();

    let missing: HashSet<String> = validate_files(&paths).iter().map(|p| text(p)).collect();
    let stale: Vec<String> = library
        .iter()
        .filter(|track| missing.contains(&track.file_path))
        .map(|track| track.id.clone())
        .collect();

    if stale.is_empty() {
        return 0;
    }

    tracks::remove_many(conn, &stale)
        .await
        .expect("the removal runs");
    stale.len()
}

fn scan(root: &Path) -> Vec<ScannedFile> {
    let cancel = CancellationToken::new();
    scan_folder(root, None, &cancel, &ignore_progress).expect("the scan succeeds")
}

#[tokio::test]
async fn a_new_file_is_inserted() {
    let mut library = Library::fresh().await;
    let music = tempfile::tempdir().expect("a temp dir");
    let path = tree::wav(music.path(), "new.wav");
    tree::tag(&path, "Brand New", "An Artist", "An Album");

    let added = reconcile(library.conn(), &scan(music.path())).await;

    assert_eq!(added, 1);
    let rows = tracks::get_all(library.conn())
        .await
        .expect("the library reads");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].title, "Brand New");
    assert_eq!(rows[0].file_path, text(&path));
}

#[tokio::test]
async fn rescanning_an_unchanged_folder_adds_nothing() {
    let mut library = Library::fresh().await;
    let music = tempfile::tempdir().expect("a temp dir");
    tree::wav(music.path(), "one.wav");
    tree::wav(music.path(), "two.wav");

    assert_eq!(reconcile(library.conn(), &scan(music.path())).await, 2);
    assert_eq!(
        reconcile(library.conn(), &scan(music.path())).await,
        0,
        "a second pass over the same paths is a no-op"
    );

    assert_eq!(
        tracks::get_all(library.conn())
            .await
            .expect("the library reads")
            .len(),
        2
    );
}

#[tokio::test]
async fn edited_tags_are_never_picked_up_by_a_rescan() {
    // v1 filters an existing path out *before* reading it, so a file retagged on
    // disk stays stale in the library forever. Documented as behaviour, not as a
    // bug to be quietly fixed here — fixing it needs a change-detection design.
    let mut library = Library::fresh().await;
    let music = tempfile::tempdir().expect("a temp dir");
    let path = tree::wav(music.path(), "song.wav");
    tree::tag(&path, "Original Title", "Artist", "Album");

    reconcile(library.conn(), &scan(music.path())).await;

    tree::tag(&path, "Corrected Title", "Artist", "Album");
    let added = reconcile(library.conn(), &scan(music.path())).await;

    assert_eq!(added, 0);
    let rows = tracks::get_all(library.conn())
        .await
        .expect("the library reads");
    assert_eq!(
        rows[0].title, "Original Title",
        "the database still holds the tags from the first scan"
    );
}

#[tokio::test]
async fn a_deleted_file_is_swept_only_by_validation() {
    let mut library = Library::fresh().await;
    let music = tempfile::tempdir().expect("a temp dir");
    let kept = tree::wav(music.path(), "kept.wav");
    let removed = tree::wav(music.path(), "removed.wav");

    assert_eq!(reconcile(library.conn(), &scan(music.path())).await, 2);

    std::fs::remove_file(&removed).expect("the fixture deletes");

    // A rescan alone does not notice — nothing removes rows but validation.
    reconcile(library.conn(), &scan(music.path())).await;
    assert_eq!(
        tracks::get_all(library.conn())
            .await
            .expect("the library reads")
            .len(),
        2
    );

    assert_eq!(sweep_missing(library.conn()).await, 1);

    let rows = tracks::get_all(library.conn())
        .await
        .expect("the library reads");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].file_path, text(&kept));
}

#[tokio::test]
async fn a_moved_file_loses_its_identity_and_its_play_count() {
    // The headline of the matrix. If this test ever starts failing because
    // somebody implemented move detection, that is a feature landing — update
    // the assertions deliberately and update the crate docs with them.
    let mut library = Library::fresh().await;
    let music = tempfile::tempdir().expect("a temp dir");

    let original = tree::wav(music.path(), "Old Folder/song.wav");
    tree::tag(&original, "A Song", "An Artist", "An Album");
    reconcile(library.conn(), &scan(music.path())).await;

    let before = tracks::get_all(library.conn())
        .await
        .expect("the library reads");
    let original_id = before[0].id.clone();

    // The user has played it a few times and favourited it.
    for _ in 0..7 {
        tracks::increment_play_count(library.conn(), &original_id)
            .await
            .expect("the play is recorded");
    }
    tracks::toggle_favorite(library.conn(), &original_id)
        .await
        .expect("the favourite is toggled");

    let played = tracks::get_all(library.conn())
        .await
        .expect("the library reads");
    assert_eq!(played[0].play_count, Some(7));
    assert_eq!(played[0].is_favorite, Some(true));

    // Now the file moves to a different folder — same bytes, same tags.
    let moved = music.path().join("New Folder").join("song.wav");
    std::fs::create_dir_all(moved.parent().expect("a parent")).expect("the fixture writes");
    std::fs::rename(&original, &moved).expect("the fixture moves");

    let added = reconcile(library.conn(), &scan(music.path())).await;
    let swept = sweep_missing(library.conn()).await;

    assert_eq!(added, 1, "the new path looks brand new");
    assert_eq!(swept, 1, "the old path looks deleted");

    let after = tracks::get_all(library.conn())
        .await
        .expect("the library reads");
    assert_eq!(after.len(), 1, "one file on disk, one row");
    assert_eq!(after[0].file_path, text(&moved));
    assert_eq!(
        after[0].title, "A Song",
        "the tags survive; the history does not"
    );

    assert_ne!(
        after[0].id, original_id,
        "the row is a new one, so every playlist and history reference is orphaned"
    );
    assert_eq!(
        after[0].play_count,
        Some(0),
        "seven plays are gone — v1 has no path-update path"
    );
    assert_ne!(
        after[0].is_favorite,
        Some(true),
        "the favourite flag is gone with the row that held it"
    );
}

#[tokio::test]
async fn a_file_renamed_in_place_is_also_a_move() {
    // Identity is the whole path, so a rename inside one folder is
    // indistinguishable from a relocation.
    let mut library = Library::fresh().await;
    let music = tempfile::tempdir().expect("a temp dir");

    let original = tree::wav(music.path(), "01 track.wav");
    tree::tag(&original, "Track One", "Artist", "Album");
    reconcile(library.conn(), &scan(music.path())).await;

    let before = tracks::get_all(library.conn())
        .await
        .expect("the library reads")[0]
        .id
        .clone();

    let renamed = music.path().join("01 - Track One.wav");
    std::fs::rename(&original, &renamed).expect("the fixture renames");

    reconcile(library.conn(), &scan(music.path())).await;
    sweep_missing(library.conn()).await;

    let after = tracks::get_all(library.conn())
        .await
        .expect("the library reads");
    assert_eq!(after.len(), 1);
    assert_eq!(after[0].file_path, text(&renamed));
    assert_ne!(after[0].id, before);
}

#[tokio::test]
async fn importing_the_same_folder_twice_concurrently_cannot_duplicate_a_row() {
    // `file_path` is UNIQUE and `add_many` is ON CONFLICT DO NOTHING, which is
    // what makes the renderer's non-atomic exists-then-add safe. Asserted here
    // because the scan is what feeds it.
    let mut library = Library::fresh().await;
    let music = tempfile::tempdir().expect("a temp dir");
    tree::wav(music.path(), "one.wav");

    let scanned = scan(music.path());

    // Both passes see an empty library, as two racing imports would.
    let first = reconcile(library.conn(), &scanned).await;
    let second = tracks::add_many(
        library.conn(),
        &[TrackCreateInput {
            file_path: text(&scanned[0].file_path),
            title: scanned[0].metadata.title.clone(),
            artist: None,
            album_artist: None,
            album: None,
            duration: None,
            genre: None,
            year: None,
            track_number: None,
            disc_number: None,
            album_art: None,
        }],
    )
    .await
    .expect("the racing import runs")
    .len();

    assert_eq!(first, 1);
    assert_eq!(second, 0, "the loser of the race inserts nothing");
    assert_eq!(
        tracks::get_all(library.conn())
            .await
            .expect("the library reads")
            .len(),
        1
    );
}
