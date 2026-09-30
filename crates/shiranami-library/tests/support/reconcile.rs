//! The reconciliation harness both `reconciliation*.rs` suites share: a
//! fixture database, and ports of what the renderer and `db:tracks:add-many`
//! do with a scan. See `tests/reconciliation.rs` for why it lives in a test.
//!
//! `#[path]`-included rather than a `mod.rs`, matching `tree.rs`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use shiranami_core::models::TrackCreateInput;
use shiranami_db::repo::tracks::{self, IdentifiedTrack};
use shiranami_library::scan::{ScannedFile, ignore_progress, scan_folder};
use shiranami_library::{content_hashes, moved_away, validate_files};
use sqlx::SqliteConnection;
use sqlx::pool::PoolConnection;
use tempfile::TempDir;
use tokio_util::sync::CancellationToken;

/// A fixture database plus the single connection every call borrows.
///
/// The pool holds exactly one connection, so acquiring twice would hang rather
/// than fail — the fixture acquires once and hands out `&mut` borrows, which is
/// the arrangement `shiranami-db`'s own tests use.
pub(crate) struct Library {
    _dir: TempDir,
    connection: PoolConnection<sqlx::Sqlite>,
}

impl Library {
    pub(crate) async fn fresh() -> Self {
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

    pub(crate) fn conn(&mut self) -> &mut SqliteConnection {
        &mut self.connection
    }
}

pub(crate) fn text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// What one reconciliation pass did, as the renderer counts it.
#[derive(Debug, Default, PartialEq)]
pub(crate) struct Pass {
    /// Rows inserted: the renderer's `addedCount`.
    pub(crate) added: usize,
    /// Rows re-pointed at a moved file: the renderer's `movedIds`.
    pub(crate) moved: usize,
}

/// `scanAndPersistFolder`'s persistence half: filter by path, then import
/// through the move-aware path `db:tracks:add-many` takes.
pub(crate) async fn reconcile(conn: &mut SqliteConnection, scanned: &[ScannedFile]) -> Pass {
    if scanned.is_empty() {
        return Pass::default();
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
        return Pass::default();
    }

    let hashes = content_hashes(
        &genuinely_new
            .iter()
            .map(|input| input.file_path.clone())
            .collect::<Vec<_>>(),
    );
    let identified: Vec<IdentifiedTrack> = genuinely_new
        .into_iter()
        .zip(hashes)
        .map(|(input, content_hash)| IdentifiedTrack {
            input,
            content_hash,
        })
        .collect();

    // The rescan follows moves: read the matching rows' paths, then decide
    // which have moved away with the real guard. The fixture registers no
    // music folders, so the guard's folder rule has nothing to check here
    // (`identity/gone.rs` tests it); the file and volume rules apply.
    let hashes: Vec<String> = identified
        .iter()
        .filter_map(|item| item.content_hash.clone())
        .collect();
    let gone: HashSet<String> = tracks::candidate_paths(conn, &hashes)
        .await
        .expect("the candidates read")
        .into_iter()
        .filter(|path| moved_away(path, &[] as &[String]))
        .collect();

    let imported = tracks::import_many(conn, &identified, &gone)
        .await
        .expect("the import runs");
    Pass {
        added: imported.added.len(),
        moved: imported.moved.len(),
    }
}

/// The validation half of `useLibraryRescan.rescan`: flag, map to ids, delete.
pub(crate) async fn sweep_missing(conn: &mut SqliteConnection) -> usize {
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

pub(crate) fn scan(root: &Path) -> Vec<ScannedFile> {
    let cancel = CancellationToken::new();
    scan_folder(root, None, &cancel, &ignore_progress).expect("the scan succeeds")
}
