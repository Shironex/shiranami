//! Content identity in the shell: measuring it for imports, and backfilling it
//! for the library that existed before it did.
//!
//! The hash itself is `shiranami_library::identity`'s and the move-aware SQL
//! is `shiranami_db::repo::track_identity`'s. What lives here is the one thing
//! neither crate can do: sequence file I/O against the pool's single
//! connection. The rule is the one `db_tracks` states for every command,
//! **acquire late, release early**, and hashing is file I/O, so it always
//! runs before the connection is taken and never while it is held.
//!
//! # Why the hash is measured at import, not during the scan
//!
//! `db:tracks:add-many` and `db:tracks:add` are the only two ways a row is
//! born (the folder scan, the rescan, the add-folder flow and the download
//! importer all end in one of them), so measuring there covers every entry
//! path with no wire change: the renderer keeps sending exactly what it sent,
//! and the hash never crosses IPC. The cost is paid only for paths that are
//! new to the library, because the renderer has already filtered known ones
//! out with `exists-many`.
//!
//! # The backfill
//!
//! Rows imported before migration `0009` have no hash, and a row without a
//! hash cannot be followed. The file has to be hashed *while it is still at
//! its old path*, which is why this runs at boot rather than at rescan (by
//! the time a rescan sees the move, the old file is gone). It runs once per
//! launch, off the setup hook and after a delay, in pages of [`PAGE`] rows:
//! read a page (connection held for one query), hash it (connection
//! released), write the page (held for one transaction). A row whose file
//! cannot be read is skipped by the keyset cursor and retried next launch.

use std::path::Path;
use std::time::Duration;

use shiranami_core::models::TrackCreateInput;
use shiranami_db::repo::tracks::{self, IdentifiedTrack};
use tauri::{AppHandle, Manager as _};

use crate::state::AppState;

/// Rows per backfill page.
///
/// At the measured cost of a sampled hash (see the lane report and
/// `shiranami-library`'s `identity_bench` example) a page is well under a
/// second of work on a local disk, so the connection is never unavailable to
/// the UI for longer than one short write.
const PAGE: i64 = 64;

/// How long after boot the backfill starts.
///
/// Late enough that the cold-start library read, the art prune and the
/// first paint have the disk to themselves.
const START_DELAY: Duration = Duration::from_secs(20);

/// Pause between pages, so a large first backfill yields the disk and the
/// connection to anything the user is doing.
const PAGE_PAUSE: Duration = Duration::from_millis(100);

/// The existence check the import uses to decide a row's file is gone.
///
/// [`Path::exists`], so any failure reads as missing: the same check
/// `library:validate-files` makes, which means a row is re-pointable exactly
/// when the rescan would otherwise have deleted it.
pub fn on_disk(path: &str) -> bool {
    Path::new(path).exists()
}

/// Measure the content identity of every input, off the async runtime.
///
/// A batch whose hashing task fails is imported unhashed rather than refused:
/// losing move detection for one import is better than losing the import.
pub async fn identify(inputs: Vec<TrackCreateInput>) -> Vec<IdentifiedTrack> {
    let paths: Vec<String> = inputs.iter().map(|input| input.file_path.clone()).collect();
    let hashes =
        tauri::async_runtime::spawn_blocking(move || shiranami_library::content_hashes(&paths))
            .await
            .unwrap_or_else(|error| {
                tracing::warn!(%error, "hashing an import failed; importing it without identities");
                Vec::new()
            });

    let mut hashes = hashes.into_iter();
    inputs
        .into_iter()
        .map(|input| IdentifiedTrack {
            input,
            content_hash: hashes.next().flatten(),
        })
        .collect()
}

/// Start the once-per-launch backfill. Returns immediately.
pub fn spawn_backfill(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(START_DELAY).await;
        let Some(state) = app.try_state::<AppState>() else {
            return;
        };
        match backfill(&state, PAGE_PAUSE).await {
            Ok(hashed) if hashed > 0 => {
                tracing::info!(hashed, "backfilled track content identities");
            }
            Ok(_) => {}
            Err(error) => tracing::warn!(?error, "the content identity backfill stopped"),
        }
    });
}

/// Hash every row that has no identity yet, page by page. Returns how many
/// rows took one.
pub async fn backfill(state: &AppState, pause: Duration) -> Result<u64, shiranami_db::DbError> {
    let mut after = 0;
    let mut hashed = 0;

    loop {
        let page = {
            let Ok(mut conn) = state.conn().await else {
                return Ok(hashed);
            };
            tracks::unhashed(&mut conn, after, PAGE).await?
        };
        let Some(last) = page.last() else {
            return Ok(hashed);
        };
        after = last.rowid;

        let paths: Vec<String> = page.iter().map(|row| row.file_path.clone()).collect();
        let hashes =
            tauri::async_runtime::spawn_blocking(move || shiranami_library::content_hashes(&paths))
                .await
                .unwrap_or_default();

        let measured: Vec<(String, String)> = page
            .into_iter()
            .zip(hashes)
            .filter_map(|(row, hash)| hash.map(|hash| (row.id, hash)))
            .collect();

        if !measured.is_empty() {
            let Ok(mut conn) = state.conn().await else {
                return Ok(hashed);
            };
            hashed += tracks::set_content_hashes(&mut conn, &measured).await?;
        }

        tokio::time::sleep(pause).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;

    fn input(file_path: &str, title: &str) -> TrackCreateInput {
        TrackCreateInput {
            file_path: file_path.to_owned(),
            title: title.to_owned(),
            ..TrackCreateInput::default()
        }
    }

    #[tokio::test]
    async fn identify_hashes_readable_files_and_leaves_the_rest_unhashed() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let present = dir.path().join("a.mp3");
        std::fs::write(&present, b"not really audio").expect("the fixture writes");
        let present = present.to_string_lossy().into_owned();

        let identified = identify(vec![input(&present, "A"), input("/gone/b.mp3", "B")]).await;

        assert_eq!(identified.len(), 2);
        assert_eq!(
            identified[0].input.file_path, present,
            "input order is kept"
        );
        assert!(identified[0].content_hash.is_some());
        assert!(identified[1].content_hash.is_none());
    }

    /// The backfill must never hold the pool's only connection while it
    /// hashes, and must finish past rows it cannot hash. A leaked connection
    /// would hang, so the whole run is under a timeout.
    #[tokio::test]
    async fn the_backfill_hashes_what_it_can_and_releases_the_connection() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let music = dir.path().join("a.mp3");
        std::fs::write(&music, b"not really audio").expect("the fixture writes");

        {
            let mut conn = state.conn().await.expect("acquire");
            tracks::add(&mut conn, &input(&music.to_string_lossy(), "A"))
                .await
                .expect("seed");
            tracks::add(&mut conn, &input("/gone/b.mp3", "B"))
                .await
                .expect("seed");
        }

        let hashed =
            tokio::time::timeout(Duration::from_secs(10), backfill(&state, Duration::ZERO))
                .await
                .expect("the backfill held the only connection")
                .expect("the backfill runs");

        assert_eq!(hashed, 1);
        let mut conn = state.conn().await.expect("acquire");
        let left = tracks::unhashed(&mut conn, 0, 10).await.expect("read");
        assert_eq!(left.len(), 1, "the missing file is left for a later launch");
        assert_eq!(left[0].file_path, "/gone/b.mp3");
    }
}
