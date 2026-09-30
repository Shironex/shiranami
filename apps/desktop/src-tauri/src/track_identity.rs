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
//!
//! Before a page is hashed, each row's volume root and registered music
//! folder are asked whether they answer (`MovedAway::roots_present`), and a
//! row on a root that does not is skipped the same way, unread. The verdicts
//! are carried from page to page, so a share that is offline or hung after
//! sleep costs one probe per launch rather than one file timeout per row on
//! the shared rayon pool. A file that hangs by itself under a healthy root
//! still costs its own timeout, as in [`verified_gone`].
//!
//! # Following a move is opt-in, and decided with the connection released
//!
//! Only the rescan follows moves (`db:tracks:add-many` with `followMoves`).
//! Adding a folder, a download and a share all insert plainly: they never
//! sweep the library, so a row they re-pointed would not be one the same flow
//! was about to delete, and a match there is far more likely a copy of a file
//! on storage that is merely offline. When the caller does opt in,
//! [`verified_gone`] reads the matching rows' paths, **releases the
//! connection**, and checks each with `shiranami_library::moved_away` (file
//! definitely not found; its volume, registered music folder and nearest
//! existing ancestor definitely present and holding real entries; see that
//! module for the accepted residuals). The import then runs
//! against that precomputed set, so no `stat`, which can block for the OS
//! timeout on an offline network path, ever runs while the pool's only
//! connection is held.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use shiranami_core::models::TrackCreateInput;
use shiranami_db::repo::folders;
use shiranami_db::repo::tracks::{self, IdentifiedTrack};
use tauri::{AppHandle, Manager as _};

use crate::error::{CommandResult, WireResultExt as _};
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

/// The paths, among rows sharing a hash with `identified`, whose files have
/// moved away (see the module docs). Holds the connection only for the two
/// reads; every existence check runs after it is released.
pub async fn verified_gone(
    state: &AppState,
    identified: &[IdentifiedTrack],
) -> CommandResult<HashSet<String>> {
    let hashes: Vec<String> = identified
        .iter()
        .filter_map(|item| item.content_hash.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    if hashes.is_empty() {
        return Ok(HashSet::new());
    }

    let (candidates, roots) = {
        let mut conn = state.conn().await?;
        let candidates = tracks::candidate_paths(&mut conn, &hashes).await.wire()?;
        if candidates.is_empty() {
            return Ok(HashSet::new());
        }
        let roots: Vec<String> = folders::get_all(&mut conn)
            .await
            .wire()?
            .into_iter()
            .map(|folder| folder.path)
            .collect();
        (candidates, roots)
    };

    // One checker for the batch. A root that fails, or a file whose own stat
    // errors, marks the roots in play as failed, so a hung mount costs at most
    // one timeout for its root and one for the first file under it, never one
    // per candidate. A file under a healthy root that hangs by itself still
    // costs its own timeout, and so does every file under no registered folder
    // and on no recognised volume root, which has no root verdict to cache.
    // The database connection is free throughout.
    let gone = tauri::async_runtime::spawn_blocking(move || {
        shiranami_library::moved_away_all(candidates, &roots)
    })
    .await
    .unwrap_or_else(|error| {
        tracing::warn!(%error, "checking moved files failed; importing without following moves");
        HashSet::new()
    });

    Ok(gone)
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
    let mut verdicts = HashMap::new();
    // One pool for the whole run: an import swaps the live pool, and a hash
    // measured against the old library must not land on a same-id row in the
    // new one. The import closes this pool, which ends the run below.
    let pool = state.pool();

    loop {
        let (page, roots) = {
            let Ok(mut conn) = pool.acquire().await else {
                return Ok(hashed);
            };
            let page = tracks::unhashed(&mut conn, after, PAGE).await?;
            let roots: Vec<String> = folders::get_all(&mut conn)
                .await?
                .into_iter()
                .map(|folder| folder.path)
                .collect();
            (page, roots)
        };
        let Some(last) = page.last() else {
            return Ok(hashed);
        };
        after = last.rowid;

        let paths: Vec<String> = page.iter().map(|row| row.file_path.clone()).collect();
        let (hashes, carried) = tauri::async_runtime::spawn_blocking(move || {
            hash_where_roots_answer(&paths, &roots, verdicts)
        })
        .await
        .unwrap_or_default();
        verdicts = carried;

        let measured: Vec<tracks::MeasuredHash> = page
            .into_iter()
            .zip(hashes)
            .filter_map(|(row, hash)| {
                hash.map(|hash| tracks::MeasuredHash {
                    id: row.id,
                    file_path: row.file_path,
                    hash,
                })
            })
            .collect();

        if !measured.is_empty() {
            let Ok(mut conn) = pool.acquire().await else {
                return Ok(hashed);
            };
            hashed += tracks::set_content_hashes(&mut conn, &measured).await?;
        }

        tokio::time::sleep(pause).await;
    }
}

/// [`shiranami_library::content_hashes`] for the paths whose volume root and
/// registered music folder answer, in input order, with `None` for the rest.
/// Takes and returns the root verdicts so the backfill can carry them from
/// page to page.
fn hash_where_roots_answer(
    paths: &[String],
    roots: &[String],
    verdicts: HashMap<String, bool>,
) -> (Vec<Option<String>>, HashMap<String, bool>) {
    let mut checker = shiranami_library::identity::MovedAway::new(roots).with_verdicts(verdicts);
    let answering: Vec<bool> = paths
        .iter()
        .map(|path| checker.roots_present(path))
        .collect();
    let readable: Vec<&String> = paths
        .iter()
        .zip(&answering)
        .filter_map(|(path, &answers)| answers.then_some(path))
        .collect();

    let mut measured = shiranami_library::content_hashes(&readable).into_iter();
    let hashes = answering
        .into_iter()
        .map(|answers| {
            if answers {
                measured.next().flatten()
            } else {
                None
            }
        })
        .collect();
    (hashes, checker.into_verdicts())
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

    /// The offline-share guard, end to end through the command layer's read:
    /// two rows share a hash and both files are missing, but only one lived in
    /// a music folder that is present. The other folder is gone as a whole
    /// (an unmounted share), so its row is offline, not moved.
    #[tokio::test]
    async fn only_a_row_whose_music_folder_is_present_counts_as_moved() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let music = dir.path().join("music");
        std::fs::create_dir_all(&music).expect("the fixture writes");
        // A folder in use lists entries; an empty one reads as a leftover
        // mount point and is never trusted.
        std::fs::write(music.join("other.mp3"), b"x").expect("the fixture writes");
        let share = dir.path().join("share");
        let moved = music.join("a.mp3").to_string_lossy().into_owned();
        let offline = share.join("b.mp3").to_string_lossy().into_owned();

        {
            let mut conn = state.conn().await.expect("acquire");
            folders::add(&mut conn, &music.to_string_lossy())
                .await
                .expect("folder");
            folders::add(&mut conn, &share.to_string_lossy())
                .await
                .expect("folder");
            let seeded: Vec<IdentifiedTrack> = [&moved, &offline]
                .iter()
                .map(|path| IdentifiedTrack {
                    input: input(path, "Song"),
                    content_hash: Some("a1:song".to_owned()),
                })
                .collect();
            tracks::import_many(&mut conn, &seeded, &HashSet::new())
                .await
                .expect("seed");
        }

        let incoming = [IdentifiedTrack {
            input: input("/elsewhere/song.mp3", "Song"),
            content_hash: Some("a1:song".to_owned()),
        }];
        let gone = verified_gone(&state, &incoming)
            .await
            .expect("the check runs");

        assert_eq!(gone, HashSet::from([moved]));
    }

    #[tokio::test]
    async fn nothing_is_checked_for_files_that_could_not_be_hashed() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let incoming = [IdentifiedTrack {
            input: input("/x.mp3", "X"),
            content_hash: None,
        }];

        assert!(
            verified_gone(&state, &incoming)
                .await
                .expect("runs")
                .is_empty()
        );
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

    /// A readable file on a root that did not answer is left unhashed, and so
    /// unread, while its neighbours on healthy roots keep their place.
    #[test]
    fn only_files_whose_roots_answer_are_hashed() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let music = dir.path().join("music");
        let share = dir.path().join("share");
        for folder in [&music, &share] {
            std::fs::create_dir_all(folder).expect("the fixture writes");
            std::fs::write(folder.join("a.mp3"), b"not really audio").expect("the fixture writes");
        }
        let music_root = music.to_string_lossy().into_owned();
        let share_root = share.to_string_lossy().into_owned();
        let paths = [
            share.join("a.mp3").to_string_lossy().into_owned(),
            music.join("a.mp3").to_string_lossy().into_owned(),
        ];
        // The share is readable here; the verdict stands in for a hung mount.
        let verdicts = HashMap::from([(share_root.clone(), false)]);

        let (hashes, carried) =
            hash_where_roots_answer(&paths, &[music_root.clone(), share_root.clone()], verdicts);

        assert!(
            hashes[0].is_none(),
            "the file on the failed root is skipped"
        );
        assert!(hashes[1].is_some(), "input order is kept");
        assert_eq!(carried.get(&share_root), Some(&false));
        assert_eq!(carried.get(&music_root), Some(&true));
    }
}
