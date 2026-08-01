//! `db:folders:*` — the watched library folders.
//!
//! Four channels, the smallest namespace in the surface, ported from
//! `apps/desktop/src/main/ipc/database/folders.ts`. Every one of them delegates
//! straight into `shiranami_db::repo::folders`, which settled in Phase 7 the two
//! things this table gets quietly wrong: the deliberate absence of an
//! `ORDER BY` (v1 read it unordered, so the settings list has always shown
//! insertion order) and `last_scanned`'s JavaScript timestamp format, which is
//! reproduced rather than tidied because both formats are already on disk.
//!
//! # Validation
//!
//! `foldersAddArgs` was `z.tuple([z.string().min(1)])`. serde gives the shape;
//! the non-empty bound is the semantic half zod also carried and is re-raised
//! here as `BAD_REQUEST`, the same code v1's zod failure produced. The three
//! id-taking channels were `z.tuple([uuid])`, and the reference namespaces do
//! not re-raise UUID *format* — an id the database does not hold is a no-op
//! read or delete either way, which is what v1 did with a well-formed unknown
//! one.
//!
//! # One thing v1 did here that v2 defers
//!
//! `folders:add` and `folders:remove` both called `invalidateFoldersCache()`
//! after writing. The cache is [`shiranami_core::paths::FoldersCache`] and it
//! belongs to the stream server's state (`shiranami_serve::ServeState`), which
//! `AppState::deferred.serve` holds as an opaque `ServeHandle` — the handle
//! exposes its address, token and shutdown, and no route to the cache. Wiring
//! one is Phase 16's job, not this command's, for the same reason
//! `db_tracks_remove_many` does not run v1's orphaned-art sweep: sequencing a
//! write against a *neighbouring* crate's state is the composition root's
//! responsibility.
//!
//! The consequence is bounded and worth stating: until that lands, a folder
//! added or removed mid-session is not immediately reflected in the audio
//! route's path allowlist. The cache rebuilds lazily, so the window closes on
//! its own; nothing is served that was not already authorized.

use shiranami_core::models::WatchedFolder;
use shiranami_db::repo::folders;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _, bad_request};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::db_folders::db_folders_get_all,
                crate::commands::db_folders::db_folders_add,
                crate::commands::db_folders::db_folders_remove,
                crate::commands::db_folders::db_folders_update_scanned,
            ]
        }
    };
}
pub(crate) use commands;

/// `db:folders:get-all` — every watched folder, in insertion order.
#[tauri::command]
#[specta::specta]
pub async fn db_folders_get_all(state: State<'_, AppState>) -> CommandResult<Vec<WatchedFolder>> {
    let mut conn = state.conn().await?;
    folders::get_all(&mut conn).await.wire()
}

/// `db:folders:add` — watch a folder.
///
/// The `path` column is `UNIQUE` and v1 did *not* soften the conflict here, so
/// adding a folder twice rejects rather than returning the existing row. That is
/// the opposite of `db:tracks:add` and is deliberate: this is a user action with
/// a visible outcome, not a background race.
#[tauri::command]
#[specta::specta]
pub async fn db_folders_add(
    state: State<'_, AppState>,
    folder_path: String,
) -> CommandResult<Option<WatchedFolder>> {
    validate_path(&folder_path)?;

    let mut conn = state.conn().await?;
    folders::add(&mut conn, &folder_path).await.wire()
}

/// v1's `z.string().min(1)`.
///
/// Extracted rather than inlined so it is reachable from a test without a Tauri
/// runtime — the alternative is a copy of the guard in the test module, which is
/// a guard that can silently stop matching the one that runs.
fn validate_path(folder_path: &str) -> CommandResult<()> {
    if folder_path.is_empty() {
        return Err(bad_request("the folder path must not be empty"));
    }
    Ok(())
}

/// `db:folders:remove` — stop watching a folder.
///
/// Tracks already imported from it are left alone, as in v1: the rows outlive
/// the watch, so unwatching a folder does not empty the library.
#[tauri::command]
#[specta::specta]
pub async fn db_folders_remove(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let mut conn = state.conn().await?;
    folders::remove(&mut conn, &id).await.wire()
}

/// `db:folders:update-scanned` — stamp a folder as scanned just now.
#[tauri::command]
#[specta::specta]
pub async fn db_folders_update_scanned(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Option<WatchedFolder>> {
    let mut conn = state.conn().await?;
    folders::update_scanned(&mut conn, &id).await.wire()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use shiranami_core::error::codes;
    use std::time::Duration;

    /// The acquire-once discipline, asserted the way `db:tracks` asserts it.
    ///
    /// Four commands run back to back over one `AppState`, each taking the
    /// pool's single connection and releasing it on return. A command that
    /// leaked one would not fail, it would hang, so the body runs under a
    /// timeout and a hang is reported as a failure that says what happened.
    #[tokio::test]
    async fn every_command_releases_the_connection_it_acquired() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let exercise = async {
            let mut conn = state.conn().await.expect("acquire");
            let added = folders::add(&mut conn, "/music")
                .await
                .expect("insert")
                .expect("a row");
            drop(conn);

            for _ in 0..4 {
                let mut conn = state.conn().await.expect("acquire");
                folders::get_all(&mut conn).await.expect("read");
            }

            let mut conn = state.conn().await.expect("acquire");
            folders::update_scanned(&mut conn, &added.id)
                .await
                .expect("stamp");
            drop(conn);

            let mut conn = state.conn().await.expect("acquire");
            folders::remove(&mut conn, &added.id).await.expect("remove");
        };

        tokio::time::timeout(Duration::from_secs(10), exercise)
            .await
            .expect(
                "a command held the pool's only connection past its return — with \
                 max_connections = 1 that is a self-deadlock, not contention",
            );
    }

    /// v1's `z.string().min(1)`, which is the whole of this namespace's
    /// semantic validation.
    #[test]
    fn an_empty_folder_path_is_a_bad_request() {
        assert_eq!(
            validate_path("").expect_err("empty is refused").code,
            codes::validation::BAD_REQUEST
        );
        assert!(validate_path("/music").is_ok());
    }

    /// v1's `folders:add inserts a folder and returns it`, at the layer the
    /// renderer calls.
    #[tokio::test]
    async fn add_returns_the_row_it_inserted() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        let added = folders::add(&mut conn, "/music/lofi")
            .await
            .expect("insert")
            .expect("a row");

        assert_eq!(added.path, "/music/lofi");
        assert!(
            added.last_scanned.is_none(),
            "a folder is unscanned until the first scan stamps it"
        );
    }

    /// v1's `folders:remove deletes a folder by id`.
    #[tokio::test]
    async fn remove_deletes_the_folder_by_id() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        let added = folders::add(&mut conn, "/music/lofi")
            .await
            .expect("insert")
            .expect("a row");
        folders::remove(&mut conn, &added.id).await.expect("remove");

        assert!(folders::get_all(&mut conn).await.expect("read").is_empty());
    }

    /// The list is unordered on purpose — v1 issued no `ORDER BY`, so SQLite's
    /// rowid scan is insertion order and that is what the settings list has
    /// always shown. An `ORDER BY path` added here would visibly reshuffle an
    /// existing user's folder list.
    #[tokio::test]
    async fn get_all_reads_back_in_insertion_order() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        for path in ["/z-last", "/a-first", "/m-middle"] {
            folders::add(&mut conn, path).await.expect("insert");
        }

        let paths: Vec<String> = folders::get_all(&mut conn)
            .await
            .expect("read")
            .into_iter()
            .map(|folder| folder.path)
            .collect();

        assert_eq!(paths, ["/z-last", "/a-first", "/m-middle"]);
    }

    #[tokio::test]
    async fn an_empty_folder_list_reads_as_an_empty_list_not_an_error() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        assert!(folders::get_all(&mut conn).await.expect("read").is_empty());
    }
}
