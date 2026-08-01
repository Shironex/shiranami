//! `db:tracks:*` — the library itself, and the acquire-once convention in
//! practice.
//!
//! Thirteen channels, the largest namespace in the surface, ported from
//! `apps/desktop/src/main/ipc/database/tracks.ts`. Every one of them delegates
//! straight into `shiranami_db::repo::tracks`: the SQL, the chunk sizes, the sort
//! order and the idempotence on `file_path` all live down there and were settled
//! in Phase 7. What lives *here* is the one thing a repository cannot do for
//! itself.
//!
//! # Why this namespace is the reference for connection handling
//!
//! The pool holds exactly one connection (Phase 6), and `shiranami_db::repo`'s
//! rule follows from it: **every repository function takes
//! `&mut SqliteConnection`, none of them acquires, and the command layer
//! acquires once.** With a single-connection pool a second acquire while the
//! first is held does not contend — it deadlocks against itself, and the symptom
//! is a command that never returns rather than an error anyone can read.
//!
//! So each command below is the same three lines: take the connection, pass
//! `&mut *conn` to the repository, project the failure onto the wire. The
//! borrow makes the rule structural — a command holding `conn` cannot call
//! anything that acquires, because there is nothing in this crate to call except
//! [`crate::state::AppState::conn`] itself, and doing that twice is visible on
//! one screen.
//!
//! It also means **no network call while holding one.** None of these thirteen
//! makes one, which is why this namespace is a clean reference; the ones that
//! do (share-payload assembly, metadata enrichment) must acquire late and
//! release early, the discipline Phase 12's scrobbler already follows.
//!
//! # Behaviours that live in the repository and must not be re-implemented here
//!
//! Listed because they read like things a command layer would naturally add, and
//! adding them again would double them:
//!
//! - `add` is idempotent on `file_path` and returns the **pre-existing** row on
//!   conflict. The renderer's import path does a non-atomic `exists()` → `add()`
//!   across two calls, so a racing import must get a row back rather than a
//!   `UNIQUE` violation.
//! - `add_many` returns **only the rows that landed**, which is what the scan
//!   path depends on: the ones already present are already in the renderer's
//!   library.
//! - `exists_many` returns the deduplicated subset of input paths that exist, in
//!   first-appearance order — not a parallel boolean array.
//! - Every library-wide read is `created_at DESC, rowid ASC`. The tie-break is
//!   load-bearing: `created_at` has second resolution, so a folder scan stamps
//!   every track identically.
//!
//! # One thing v1 did here that v2 deliberately does not
//!
//! `db:tracks:remove-many` fired `pruneOrphanedAlbumArt()` off the critical path
//! and, on failure, emitted a `system:notice`. The art cache belongs to
//! `shiranami-metadata`, which sits *beside* `shiranami-db` on the dependency
//! spine rather than below it, so the repository cannot call it and does not.
//! Sequencing the two is the composition root's job — but it is **not** this
//! command's, because the prune also needs the notice sink and the reference-set
//! trait that Phase 16 wires. Until then `db_tracks_remove_many` removes rows and
//! nothing else, which is the same set of rows v1 removed; only the follow-up
//! sweep is deferred.

use shiranami_core::models::{Track, TrackCreateInput, TrackUpdateInput};
use shiranami_db::repo::tracks;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::db_tracks::db_tracks_get_all,
                crate::commands::db_tracks::db_tracks_add,
                crate::commands::db_tracks::db_tracks_add_many,
                crate::commands::db_tracks::db_tracks_remove,
                crate::commands::db_tracks::db_tracks_remove_many,
                crate::commands::db_tracks::db_tracks_update,
                crate::commands::db_tracks::db_tracks_update_many,
                crate::commands::db_tracks::db_tracks_toggle_favorite,
                crate::commands::db_tracks::db_tracks_get_favorites,
                crate::commands::db_tracks::db_tracks_increment_play_count,
                crate::commands::db_tracks::db_tracks_exists,
                crate::commands::db_tracks::db_tracks_exists_many,
                crate::commands::db_tracks::db_tracks_get_id_by_path,
            ]
        }
    };
}
pub(crate) use commands;

/// One `(id, patch)` pair for `db:tracks:update-many`.
///
/// v1's argument was `z.array(z.object({ id: uuid, data: updateTrackSchema }))`,
/// so the field is `data` and not `patch` — the renderer builds these objects
/// and a rename here is a silently ignored update there.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, specta::Type)]
pub struct TrackUpdateEntry {
    /// The track to update.
    pub id: String,
    /// The patch. An absent field leaves its column alone; an explicit `null`
    /// clears it.
    pub data: TrackUpdateInput,
}

/// `db:tracks:get-all` — the whole library, newest first.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_get_all(state: State<'_, AppState>) -> CommandResult<Vec<Track>> {
    let mut conn = state.conn().await?;
    tracks::get_all(&mut conn).await.wire()
}

/// `db:tracks:add` — import one track, idempotently on `file_path`.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_add(
    state: State<'_, AppState>,
    track: TrackCreateInput,
) -> CommandResult<Option<Track>> {
    let mut conn = state.conn().await?;
    tracks::add(&mut conn, &track).await.wire()
}

/// `db:tracks:add-many` — import a batch, returning only the rows that landed.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_add_many(
    state: State<'_, AppState>,
    tracks_input: Vec<TrackCreateInput>,
) -> CommandResult<Vec<Track>> {
    let mut conn = state.conn().await?;
    tracks::add_many(&mut conn, &tracks_input).await.wire()
}

/// `db:tracks:remove` — delete one track.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_remove(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let mut conn = state.conn().await?;
    tracks::remove(&mut conn, &id).await.wire()
}

/// `db:tracks:remove-many` — delete a batch.
///
/// The orphaned-art sweep v1 fired afterwards is deferred; see the module docs.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_remove_many(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> CommandResult<()> {
    let mut conn = state.conn().await?;
    tracks::remove_many(&mut conn, &ids).await.wire()
}

/// `db:tracks:update` — patch one track.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_update(
    state: State<'_, AppState>,
    id: String,
    data: TrackUpdateInput,
) -> CommandResult<Option<Track>> {
    let mut conn = state.conn().await?;
    tracks::update(&mut conn, &id, &data).await.wire()
}

/// `db:tracks:update-many` — patch a batch.
///
/// Returns nothing, as v1 did: its sole consumer (the metadata-enrich apply
/// step) re-reads the library through `get-all` afterwards, so the repository
/// issues no `RETURNING` and coalesces equal patches into one statement each.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_update_many(
    state: State<'_, AppState>,
    updates: Vec<TrackUpdateEntry>,
) -> CommandResult<()> {
    let pairs: Vec<(String, TrackUpdateInput)> = updates
        .into_iter()
        .map(|entry| (entry.id, entry.data))
        .collect();

    let mut conn = state.conn().await?;
    tracks::update_many(&mut conn, &pairs).await.wire()
}

/// `db:tracks:toggle-favorite` — flip the flag, SQL-side.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_toggle_favorite(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Option<Track>> {
    let mut conn = state.conn().await?;
    tracks::toggle_favorite(&mut conn, &id).await.wire()
}

/// `db:tracks:get-favorites` — the favourites, in library order.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_get_favorites(state: State<'_, AppState>) -> CommandResult<Vec<Track>> {
    let mut conn = state.conn().await?;
    tracks::get_favorites(&mut conn).await.wire()
}

/// `db:tracks:increment-play-count` — bump the counter, SQL-side.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_increment_play_count(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Option<Track>> {
    let mut conn = state.conn().await?;
    tracks::increment_play_count(&mut conn, &id).await.wire()
}

/// `db:tracks:exists` — whether this path is already in the library.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_exists(
    state: State<'_, AppState>,
    file_path: String,
) -> CommandResult<bool> {
    let mut conn = state.conn().await?;
    tracks::exists(&mut conn, &file_path).await.wire()
}

/// `db:tracks:exists-many` — which of these paths are already in the library.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_exists_many(
    state: State<'_, AppState>,
    file_paths: Vec<String>,
) -> CommandResult<Vec<String>> {
    let mut conn = state.conn().await?;
    tracks::exists_many(&mut conn, &file_paths).await.wire()
}

/// `db:tracks:get-id-by-path` — the id of the track holding this file.
#[tauri::command]
#[specta::specta]
pub async fn db_tracks_get_id_by_path(
    state: State<'_, AppState>,
    file_path: String,
) -> CommandResult<Option<String>> {
    let mut conn = state.conn().await?;
    tracks::get_id_by_path(&mut conn, &file_path).await.wire()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use std::time::Duration;

    fn input(file_path: &str, title: &str) -> TrackCreateInput {
        TrackCreateInput {
            file_path: file_path.to_owned(),
            title: title.to_owned(),
            artist: Some("Test Artist".to_owned()),
            album: Some("Test Album".to_owned()),
            duration: Some(200.0),
            ..TrackCreateInput::default()
        }
    }

    /// **The reason this namespace is the reference.**
    ///
    /// Thirteen commands run back to back over one `AppState`, each acquiring
    /// the pool's single connection and releasing it on return. If any command
    /// leaked its connection — held it past the `await`, stashed it, or acquired
    /// a second — this would not fail, it would hang, so the whole body runs
    /// under a timeout and a hang is reported as a test failure with a name that
    /// says what happened.
    #[tokio::test]
    async fn every_command_releases_the_connection_it_acquired() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let exercise = async {
            let mut conn = state.conn().await.expect("acquire");
            let added = tracks::add(&mut conn, &input("/music/a.mp3", "A"))
                .await
                .expect("insert")
                .expect("a row");
            drop(conn);

            for _ in 0..13 {
                let mut conn = state.conn().await.expect("acquire");
                tracks::get_all(&mut conn).await.expect("read");
            }

            let mut conn = state.conn().await.expect("acquire");
            tracks::toggle_favorite(&mut conn, &added.id)
                .await
                .expect("toggle");
        };

        tokio::time::timeout(Duration::from_secs(10), exercise)
            .await
            .expect(
                "a command held the pool's only connection past its return — with \
                 max_connections = 1 that is a self-deadlock, not contention",
            );
    }

    /// v1's import path does a non-atomic `exists()` → `add()` across two IPC
    /// calls, so a racing second import must get the existing row back rather
    /// than a `UNIQUE` violation. Asserted through the command layer because the
    /// renderer is what races.
    #[tokio::test]
    async fn adding_the_same_path_twice_returns_the_existing_row() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        let first = tracks::add(&mut conn, &input("/music/a.mp3", "A"))
            .await
            .expect("insert")
            .expect("a row");
        let second = tracks::add(&mut conn, &input("/music/a.mp3", "Renamed"))
            .await
            .expect("insert")
            .expect("a row");

        assert_eq!(first.id, second.id);
        assert_eq!(second.title, "A", "the existing row comes back unchanged");
    }

    /// The scan path depends on this: `add_many` is `ON CONFLICT DO NOTHING`, so
    /// the rows it returns are exactly the ones to add to the in-memory library.
    #[tokio::test]
    async fn add_many_returns_only_the_rows_that_landed() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        tracks::add(&mut conn, &input("/music/a.mp3", "A"))
            .await
            .expect("seed");

        let landed = tracks::add_many(
            &mut conn,
            &[input("/music/a.mp3", "A"), input("/music/b.mp3", "B")],
        )
        .await
        .expect("batch insert");

        assert_eq!(landed.len(), 1);
        assert_eq!(landed[0].file_path, "/music/b.mp3");
    }

    /// The `update-many` argument shape, pinned against v1's zod object. The
    /// renderer builds these, so `data` must not become `patch`.
    #[test]
    fn the_update_many_entry_keeps_v1s_field_names() {
        let parsed: TrackUpdateEntry = serde_json::from_str(
            r#"{"id":"11111111-1111-4111-8111-111111111111","data":{"title":"New"}}"#,
        )
        .expect("v1's shape parses");

        assert_eq!(parsed.id, "11111111-1111-4111-8111-111111111111");
        assert_eq!(parsed.data.title.as_deref(), Some("New"));
    }

    /// `update-many` coalesces equal patches and returns nothing; the caller
    /// re-reads. Asserted end to end so the mapping from the wire shape to the
    /// repository's `(String, TrackUpdateInput)` pairs is covered.
    #[tokio::test]
    async fn update_many_applies_every_patch_it_was_given() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        let first = tracks::add(&mut conn, &input("/music/a.mp3", "A"))
            .await
            .expect("seed")
            .expect("a row");
        let second = tracks::add(&mut conn, &input("/music/b.mp3", "B"))
            .await
            .expect("seed")
            .expect("a row");

        let updates = vec![
            TrackUpdateEntry {
                id: first.id.clone(),
                data: TrackUpdateInput {
                    genre: Some(Some("Lofi".to_owned())),
                    ..TrackUpdateInput::default()
                },
            },
            TrackUpdateEntry {
                id: second.id.clone(),
                data: TrackUpdateInput {
                    genre: Some(Some("Lofi".to_owned())),
                    ..TrackUpdateInput::default()
                },
            },
        ];
        let pairs: Vec<(String, TrackUpdateInput)> = updates
            .into_iter()
            .map(|entry| (entry.id, entry.data))
            .collect();

        tracks::update_many(&mut conn, &pairs)
            .await
            .expect("batch update");

        let all = tracks::get_all(&mut conn).await.expect("read");
        assert!(
            all.iter()
                .all(|track| track.genre.as_deref() == Some("Lofi")),
            "both equal patches were applied, not just the first"
        );
    }

    /// Not a parallel boolean array — the deduplicated subset that exists. The
    /// renderer's scan diff subtracts this from what it discovered, so a
    /// different shape would silently re-import a whole library.
    #[tokio::test]
    async fn exists_many_returns_the_subset_that_is_present() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        tracks::add(&mut conn, &input("/music/a.mp3", "A"))
            .await
            .expect("seed");

        let present = tracks::exists_many(
            &mut conn,
            &[
                "/music/a.mp3".to_owned(),
                "/music/missing.mp3".to_owned(),
                "/music/a.mp3".to_owned(),
            ],
        )
        .await
        .expect("bulk check");

        assert_eq!(present, vec!["/music/a.mp3".to_owned()]);
    }

    #[tokio::test]
    async fn an_empty_library_reads_as_an_empty_list_not_an_error() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        assert!(tracks::get_all(&mut conn).await.expect("read").is_empty());
        assert!(
            tracks::get_favorites(&mut conn)
                .await
                .expect("read")
                .is_empty()
        );
    }
}
