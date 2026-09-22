//! `db:playlists:*` — user playlists and their membership.
//!
//! Thirteen channels, the joint-largest namespace in the surface, ported from
//! `apps/desktop/src/main/ipc/database/playlists.ts`.
//!
//! # Why this namespace is two files
//!
//! The thirteen channels span two tables, and `shiranami-db` already draws that
//! line: `repo::playlists` owns the six that touch the playlist rows,
//! `repo::playlist_tracks` the seven that touch membership. The same split is
//! reproduced here — this file holds the row commands, [`membership`] holds the
//! rest — because the namespace really is doing two jobs, and one file doing
//! both runs past the module-shape cap for the same reason the repository would
//! have.
//!
//! It costs nothing structurally. `#[tauri::command]` derives the invoke name
//! from the *function* ident, not the module path, so
//! `membership::db_playlists_add_track` still registers as
//! `db_playlists_add_track`; the `commands!` macro below simply names the longer
//! path. Both files sit under `commands/`, which is what
//! `lint:meta`'s `rust-command-placement` requires.
//!
//! # Behaviours that live in the repository and must not be re-implemented
//!
//! Listed because each reads like something a command layer would naturally add:
//!
//! - `create_with_tracks` deliberately does **not** de-duplicate its track list:
//!   a repeat violates `UNIQUE(playlist_id, track_id)` and rolls the whole
//!   creation back, which is what v1 did. The asymmetry with
//!   [`membership`]'s `add_tracks` is intentional — seeding a new playlist from
//!   a known selection is not the same operation as merging into an existing
//!   one.
//! - `update` always writes `updated_at`, so the `SET` clause is never empty and
//!   an all-absent patch is still a real statement that bumps the timestamp.
//!   That is v1's behaviour, spread operator included.
//! - `get_all` orders on `created_at` alone, with **no tie-break**. Unlike the
//!   library reads, playlists are created one user action at a time, so the
//!   same-second collision that makes a tie-break load-bearing there does not
//!   arise here.
//! - `delete` cascades to the membership rows; the tracks themselves are
//!   untouched.
//!
//! # Validation
//!
//! `name` was `z.string().min(1)` on `create` and `create-with-tracks`, and
//! `.optional()` on `update`. serde gives the shape; the non-empty bound is the
//! semantic half zod also carried and is re-raised as `BAD_REQUEST`. The id
//! arguments were `z.string().uuid()`, and format is deliberately not re-raised:
//! an id the database does not hold is already a no-op read, a no-op delete or
//! an empty result, which is what a well-formed unknown id did in v1 too.

pub mod membership;

use shiranami_core::models::{
    Playlist, PlaylistCreateInput, PlaylistCreateWithTracksInput, PlaylistUpdateInput,
};
use shiranami_db::repo::playlists;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _, bad_request};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
///
/// Both files' commands are named here, because the registry walks *namespaces*
/// and this namespace is one entry in the shared line list regardless of how
/// many files it occupies.
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::db_playlists::db_playlists_get_all,
                crate::commands::db_playlists::db_playlists_get,
                crate::commands::db_playlists::db_playlists_create,
                crate::commands::db_playlists::db_playlists_create_with_tracks,
                crate::commands::db_playlists::db_playlists_update,
                crate::commands::db_playlists::db_playlists_delete,
                crate::commands::db_playlists::membership::db_playlists_get_tracks,
                crate::commands::db_playlists::membership::db_playlists_add_track,
                crate::commands::db_playlists::membership::db_playlists_add_tracks,
                crate::commands::db_playlists::membership::db_playlists_remove_track,
                crate::commands::db_playlists::membership::db_playlists_remove_tracks,
                crate::commands::db_playlists::membership::db_playlists_get_playlists_for_tracks,
                crate::commands::db_playlists::membership::db_playlists_reorder,
            ]
        }
    };
}
pub(crate) use commands;

/// `db:playlists:get-all` — every playlist, newest first.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_get_all(state: State<'_, AppState>) -> CommandResult<Vec<Playlist>> {
    let mut conn = state.conn().await?;
    playlists::get_all(&mut conn).await.wire()
}

/// `db:playlists:get` — one playlist by id.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_get(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Option<Playlist>> {
    let mut conn = state.conn().await?;
    playlists::get(&mut conn, &id).await.wire()
}

/// `db:playlists:create` — create an empty playlist.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_create(
    state: State<'_, AppState>,
    data: PlaylistCreateInput,
) -> CommandResult<Option<Playlist>> {
    validate_name(&data.name)?;

    let mut conn = state.conn().await?;
    playlists::create(&mut conn, &data).await.wire()
}

/// `db:playlists:create-with-tracks` — create a playlist and seed its
/// membership, in one transaction.
///
/// `cover_art` is left `NULL`: v1's payload had no field for it and neither does
/// this one.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_create_with_tracks(
    state: State<'_, AppState>,
    data: PlaylistCreateWithTracksInput,
) -> CommandResult<Option<Playlist>> {
    validate_name(&data.name)?;

    let mut conn = state.conn().await?;
    playlists::create_with_tracks(&mut conn, &data).await.wire()
}

/// `db:playlists:update` — patch one playlist.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_update(
    state: State<'_, AppState>,
    id: String,
    data: PlaylistUpdateInput,
) -> CommandResult<Option<Playlist>> {
    if let Some(name) = &data.name {
        validate_name(name)?;
    }

    let mut conn = state.conn().await?;
    playlists::update(&mut conn, &id, &data).await.wire()
}

/// v1's `z.string().min(1)` on `name`.
///
/// Extracted rather than inlined so it is reachable from a test without a Tauri
/// runtime — the alternative is a copy of the guard in the test module, which is
/// a guard that can silently stop matching the one that runs.
fn validate_name(name: &str) -> CommandResult<()> {
    if name.is_empty() {
        return Err(bad_request("the playlist name must not be empty"));
    }
    Ok(())
}

/// `db:playlists:delete` — delete a playlist; its membership cascades.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_delete(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let mut conn = state.conn().await?;
    playlists::delete(&mut conn, &id).await.wire()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use shiranami_core::error::codes;

    fn named(name: &str) -> PlaylistCreateInput {
        PlaylistCreateInput {
            name: name.to_owned(),
            ..PlaylistCreateInput::default()
        }
    }

    #[test]
    fn an_empty_playlist_name_is_a_bad_request() {
        assert_eq!(
            validate_name("").expect_err("empty is refused").code,
            codes::validation::BAD_REQUEST
        );
        assert!(validate_name("Mix").is_ok());
    }

    /// v1's `playlists:create inserts a playlist and returns it`, at the layer
    /// the renderer calls.
    #[tokio::test]
    async fn create_returns_the_row_it_inserted() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        let created = playlists::create(&mut conn, &named("Mix"))
            .await
            .expect("insert")
            .expect("a row");

        assert_eq!(created.name, "Mix");
        assert!(created.description.is_none());
        assert!(created.cover_art.is_none());
    }

    /// Newest first, and deliberately with no tie-break — see the module docs.
    #[tokio::test]
    async fn get_all_returns_the_newest_playlist_first() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        for name in ["First", "Second"] {
            playlists::create(&mut conn, &named(name))
                .await
                .expect("insert");
        }

        let names: Vec<String> = playlists::get_all(&mut conn)
            .await
            .expect("read")
            .into_iter()
            .map(|playlist| playlist.name)
            .collect();

        assert_eq!(names.len(), 2);
        assert!(names.contains(&"First".to_owned()));
        assert!(names.contains(&"Second".to_owned()));
    }

    /// An unknown id is `null` rather than a rejection, matching v1's
    /// `Playlist | undefined`.
    #[tokio::test]
    async fn an_unknown_id_reads_as_nothing_not_as_an_error() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        assert!(
            playlists::get_all(&mut conn)
                .await
                .expect("read")
                .is_empty()
        );
        assert!(
            playlists::get(&mut conn, "no-such-playlist")
                .await
                .expect("read")
                .is_none()
        );
    }
}
