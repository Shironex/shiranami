//! `db:backup:*` — exporting the library file, and importing one back.
//!
//! Two channels, ported from `apps/desktop/src/main/ipc/database/backup.ts` and
//! the file half of `services/db-backup.ts`. `shiranami_db::repo::backup` owns
//! the three SQLite operations — the header probe, the downgrade guard and the
//! `VACUUM INTO` snapshot — and states that everything else is "file
//! orchestration and belongs to the layer above". This is that layer.
//!
//! # The one deliberate wire-shape change in this lane
//!
//! v1's two channels took **no arguments**: the path came from
//! `dialog.showSaveDialog` / `showOpenDialog` inside the main process, because
//! Electron cannot open a native dialog anywhere else. Tauri can — its dialog
//! plugin is callable from the webview — so the path arrives here as an
//! argument and the dialog belongs to the caller.
//!
//! That moves exactly one thing and nothing else. The **return shapes are v1's,
//! unchanged**, so the renderer's `if (result.success)` branching still reads
//! the same three states:
//!
//! | State | v1 | Here |
//! | ----- | -- | ---- |
//! | cancelled | `{ success: false }` | the dialog never calls the command |
//! | failed | `{ success: false, error }` | same |
//! | done | `{ success: true, path }` | same |
//!
//! The cancelled row is the shim's now, which is where it belongs: cancelling a
//! file dialog is not a database outcome, and v1 only encoded it as one because
//! the dialog and the database were in the same process.
//!
//! # Neither command rejects for an operational failure
//!
//! Both resolve with `success: false` and a message, exactly as v1 did. A
//! rejection is reserved for an argument the shim should never have sent — an
//! empty or relative path — because that is a bug in the caller rather than
//! something the user can respond to. Disk full, destination unwritable, "that
//! is not a database", "that backup is from a newer Shiranami": all of those are
//! answers, and the renderer shows the message.
//!
//! # Why the destination is not containment-checked
//!
//! `core::paths`' guards answer "may the renderer reach this media file", and
//! the answer is "only inside a watched folder or the downloads directory". A
//! backup destination is the opposite case by construction: the user is
//! deliberately writing outside the library, usually to a removable disk, and
//! `FoldersCache` would refuse every useful one. What is checked is that the
//! path is absolute — a relative path would resolve against the app's working
//! directory, which is not any place the user believes they chose.
//!
//! # The import order is the whole safety property
//!
//! Every step below is placed relative to the overwrite, and v1 learned the
//! ordering the explicit way:
//!
//! 1. **Validate the candidate** — header, then `PRAGMA user_version`. Before
//!    anything is written, so refusing a newer-schema backup does not first
//!    destroy the working library.
//! 2. **Snapshot the live library**, best effort. The user is about to lose it.
//! 3. **Release the connection and close the pool.** SQLite must not have the
//!    file open while it is replaced.
//! 4. **Copy to a temp sibling, then rename.** A rename is atomic, so an
//!    interrupted copy cannot leave a half-written database in place.
//! 5. **Delete the stale `-wal` and `-shm` sidecars**, and only now: they
//!    describe the *old* file, and leaving them would have SQLite reinterpret
//!    the imported one through them.
//! 6. **Reopen**, which runs adoption and migrations against the imported file
//!    — that is what baselines a legacy backup, and v1's `initializeDatabase`
//!    did the same.
//!
//! Step 6 runs **on the failure path too**. A failed import that left the app
//! with a closed pool would turn a refused restore into a dead window, so the
//! reopen is attempted regardless and only its own failure is fatal.

use std::path::{Path, PathBuf};

use shiranami_db::repo::backup;
use tauri::State;

use crate::error::{CommandResult, bad_request};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::db_backup::db_backup_export,
                crate::commands::db_backup::db_backup_import,
            ]
        }
    };
}
pub(crate) use commands;

/// How many pre-import snapshots are kept. v1's `MAX_BACKUPS`.
const MAX_SNAPSHOTS: usize = 5;

/// Directory the snapshots live in, beside the database. v1's
/// `<userData>/backups`.
const SNAPSHOT_DIR: &str = "backups";

/// What `db:backup:export` resolves to — v1's `DbExportResult`.
#[derive(Debug, Clone, PartialEq, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DbExportResult {
    /// Whether the library was written.
    pub success: bool,
    /// Where it was written. Set only on success.
    #[specta(optional)]
    pub path: Option<String>,
    /// Why it was not written. Technical English, as v1's was; the renderer
    /// prefers its own translation and falls back to this.
    #[specta(optional)]
    pub error: Option<String>,
}

/// What `db:backup:import` resolves to — v1's `DbImportResult`.
///
/// No `path`: v1 did not echo one back, and the renderer already knows which
/// file it offered.
#[derive(Debug, Clone, PartialEq, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DbImportResult {
    /// Whether the library was replaced.
    pub success: bool,
    /// Why it was not replaced.
    #[specta(optional)]
    pub error: Option<String>,
}

impl DbExportResult {
    /// A failure carrying a message for the renderer.
    fn failed(error: impl std::fmt::Display) -> Self {
        Self {
            success: false,
            path: None,
            error: Some(error.to_string()),
        }
    }
}

impl DbImportResult {
    /// A failure carrying a message for the renderer.
    fn failed(error: impl std::fmt::Display) -> Self {
        Self {
            success: false,
            error: Some(error.to_string()),
        }
    }
}

/// `db:backup:export` — write a consistent copy of the library to `destination`.
///
/// The snapshot is taken with `VACUUM INTO`, which is transactionally
/// consistent over a WAL database without an explicit checkpoint. It also
/// **refuses an existing destination**, where v1's `.backup()` overwrote one —
/// so the copy is written to a temp sibling and renamed into place. That
/// restores v1's overwrite behaviour and adds atomicity: a user who overwrites
/// last week's backup and loses power mid-copy still has last week's backup.
#[tauri::command]
#[specta::specta]
pub async fn db_backup_export(
    state: State<'_, AppState>,
    destination: String,
) -> CommandResult<DbExportResult> {
    let destination = validated_path(&destination, "destination")?;
    let staged = staging_path(&destination);

    // A leftover `.part` from an interrupted run would make `VACUUM INTO`
    // refuse before it started.
    //
    // The file calls in this command are `unlink` and `rename` only — constant
    // time metadata operations, safe to make inline. The expensive part, the
    // whole-database copy, is `snapshot_to`, and that is already asynchronous
    // because sqlx makes it so.
    remove_quietly(&staged);

    {
        let mut conn = state.conn().await?;
        if let Err(error) = backup::snapshot_to(&mut conn, &staged).await {
            drop(conn);
            remove_quietly(&staged);
            return Ok(DbExportResult::failed(error));
        }
    }

    if let Err(error) = std::fs::rename(&staged, &destination) {
        remove_quietly(&staged);
        return Ok(DbExportResult::failed(error));
    }

    tracing::info!(path = %destination.display(), "exported the library");

    Ok(DbExportResult {
        success: true,
        path: Some(destination.display().to_string()),
        error: None,
    })
}

/// `db:backup:import` — replace the live library with the file at `source`.
///
/// See the module docs for why the six steps are in the order they are.
#[tauri::command]
#[specta::specta]
pub async fn db_backup_import(
    state: State<'_, AppState>,
    source: String,
) -> CommandResult<DbImportResult> {
    let source = validated_path(&source, "source")?;
    let live = live_database_path(&state);

    // Steps 1 to 6 run in `replace_library`, on a **blocking thread**, driven by
    // its own `block_on`. Two independent reasons, and either alone would be
    // enough:
    //
    // - The work is a whole-database file copy plus a migration pass. Both can
    //   take seconds on a large library, and running them on a runtime worker
    //   would stall every other task — including the ones the webview is
    //   waiting on.
    // - `shiranami_db::open`'s future is **not provably `Send`**. It reborrows
    //   a `PoolConnection` by deref-coercion, which leaves rustc trying to
    //   satisfy `sqlx::Acquire<'_>` for `&mut SqliteConnection` at every
    //   lifetime rather than one. Nothing has noticed because every caller so
    //   far is a test driving it on a single thread; this is the first that
    //   needs it inside a `#[tauri::command]`, where the generated wrapper
    //   demands `Send` and reports the failure against the attribute rather
    //   than against any line of the body. `block_on` does not require `Send`
    //   of the future it drives, only of the values crossing the thread
    //   boundary — two `PathBuf`s and a pool handle here — so this sidesteps
    //   the limitation rather than papering over it. Worth fixing in
    //   `shiranami-db` before §2.8's boot sequence calls `open` from a context
    //   with the same requirement.
    //
    // `tauri::async_runtime::spawn_blocking`, never `tokio`'s (R16).
    let live_pool = state.pool();
    let importing = {
        let source = source.clone();
        let live = live.clone();
        tauri::async_runtime::spawn_blocking(move || {
            tauri::async_runtime::block_on(replace_library(source, live, live_pool))
        })
    };

    let Ok((swapped, reopened)) = importing.await else {
        tracing::error!("the import task did not run to completion");
        return Ok(DbImportResult::failed("the import did not complete"));
    };

    match (swapped, reopened) {
        (Ok(()), Ok(opened)) => {
            // Installing is synchronous and hands back the pool it displaced,
            // so the close below awaits an owned value rather than a borrow of
            // the state.
            state.install_pool(opened.pool).close().await;
            tracing::info!(path = %source.display(), "imported a library");
            Ok(DbImportResult {
                success: true,
                error: None,
            })
        }
        (Err(error), Ok(opened)) => {
            // The swap failed and the original file is untouched, so the app is
            // back exactly where it started.
            state.install_pool(opened.pool).close().await;
            Ok(DbImportResult::failed(error))
        }
        (_, Err(error)) => {
            // The pool could not be reopened. Nothing this command can do
            // leaves the app usable, so this is the one path that rejects
            // rather than resolving: a `{ success: false }` here would tell the
            // renderer to carry on against a database that is not open.
            tracing::error!(%error, "could not reopen the database after an import");
            Err(crate::error::WireResultExt::wire(Err::<(), _>(error))
                .expect_err("an error result stays an error"))
        }
    }
}

/// Steps 1 to 6 of the import, over **owned values only**.
///
/// Returns what the swap did and what reopening produced, so the caller — which
/// is the only part that needs the managed state — can install the new pool.
///
/// # The signature borrows nothing, and that is the point
///
/// `#[tauri::command]` generates a wrapper that is generic over the lifetime in
/// `State<'_, AppState>`, so every future the command body builds has to be
/// provably `Send` **for all** of those lifetimes at once. This body holds a
/// `&Path` across the connection `assert_importable` opens and a
/// `PoolConnection` across the snapshot, and rustc cannot discharge that
/// higher-ranked obligation through either: it reports "`Send` would have to be
/// implemented for `&Path` … but is actually implemented for `&'0 Path`, for
/// some specific lifetime" — against the `#[tauri::command]` attribute, naming
/// no line in the body, which is what makes it such an unhelpful error to meet.
///
/// Moving the paths and the pool handle in by value removes every borrow the
/// obligation could be about, so it does not arise rather than being worked
/// around with a `Box::pin` that only moves the error. The cost is two
/// `PathBuf` clones and a refcount bump, on a path that is about to copy a
/// database file.
///
/// Keeping the pool handle here rather than reaching back through the state
/// also makes step 3 honest: this function is handed the pool it must close,
/// so there is no way to close one and swap a different one.
async fn replace_library(
    source: PathBuf,
    live: PathBuf,
    live_pool: sqlx::SqlitePool,
) -> (
    std::io::Result<()>,
    shiranami_db::Result<shiranami_db::OpenedDatabase>,
) {
    // 1. Refuse an unusable candidate before anything is written.
    if let Err(error) = backup::assert_importable(&source).await {
        return (Ok(()), Err(error));
    }

    // 2. Snapshot the library about to be replaced. Best effort, as v1's was: a
    //    failure to take a safety copy is not a reason to refuse an import the
    //    user explicitly asked for — including a failure to acquire at all,
    //    which means the library is already unreadable and restoring over it is
    //    exactly what the user wants.
    if let Some(destination) = snapshot_destination(&live) {
        match live_pool.acquire().await {
            Ok(mut conn) => {
                if let Err(error) = backup::snapshot_to(&mut conn, &destination).await {
                    tracing::warn!(%error, "could not write the pre-import snapshot");
                }
            }
            Err(error) => {
                tracing::warn!(%error, "could not acquire a connection to snapshot");
            }
        }

        if let Some(directory) = destination.parent() {
            prune_snapshots(directory);
        }
    }

    // 3. Close the pool. Nothing may hold the file open while it is replaced.
    live_pool.close().await;

    // 4 and 5. Swap the file in, then drop the sidecars describing the old one.
    let swapped = swap_in(&source, &live);

    // 6. Reopen either way — see the module docs.
    let reopened = shiranami_db::open(&live).await;

    (swapped, reopened)
}

/// Where the live database file sits, read from the pool's own connect options.
///
/// Taken from the pool rather than re-derived from `core::paths::data_dir` on
/// purpose: a test opens a database in a temp directory, and re-deriving would
/// have this command import over the developer's real library.
fn live_database_path(state: &AppState) -> PathBuf {
    state.pool().connect_options().get_filename().to_path_buf()
}

/// v1's `${dbPath}.tmp`, and the export's `.part`.
fn staging_path(destination: &Path) -> PathBuf {
    let mut staged = destination.as_os_str().to_owned();
    staged.push(".part");
    PathBuf::from(staged)
}

/// The path is absolute and non-empty, or the caller has a bug.
///
/// See the module docs for why containment is deliberately not checked.
fn validated_path(raw: &str, what: &str) -> CommandResult<PathBuf> {
    if raw.is_empty() {
        return Err(bad_request(format!("the {what} path must not be empty")));
    }

    let path = PathBuf::from(raw);
    if !path.is_absolute() {
        return Err(bad_request(format!(
            "the {what} path must be absolute — a relative one would resolve \
             against the application's working directory"
        )));
    }

    Ok(path)
}

/// Copy `source` over `live` through a temp sibling, then drop the stale WAL
/// sidecars.
///
/// Synchronous: its only caller is [`replace_library`], which already runs on a
/// blocking thread, so wrapping each `std::fs` call in its own `spawn_blocking`
/// would be a thread hop per operation and no less blocking.
fn swap_in(source: &Path, live: &Path) -> std::io::Result<()> {
    let staged = staging_path(live);
    remove_quietly(&staged);

    if let Err(error) = std::fs::copy(source, &staged) {
        remove_quietly(&staged);
        return Err(error);
    }

    if let Err(error) = std::fs::rename(&staged, live) {
        remove_quietly(&staged);
        return Err(error);
    }

    // Only now: these describe the file that was just replaced, and SQLite
    // would reinterpret the imported one through them.
    for suffix in ["-wal", "-shm"] {
        let mut sidecar = live.as_os_str().to_owned();
        sidecar.push(suffix);
        remove_quietly(Path::new(&sidecar));
    }

    Ok(())
}

/// Write a rotating snapshot of the live database beside it.
///
/// **Infallible on purpose.** Every step logs and gives up rather than
/// propagating, because the caller has already decided to import: refusing a
/// restore the user explicitly asked for because the safety copy could not be
/// written would be the tool protecting itself rather than them. v1's
/// `backupDatabaseOnLaunch` was best-effort for the same reason and never threw.
///
/// v1 shared this rotation with a launch-time snapshot. Only the import path
/// exists in v2 so far, so it lives here; when Phase 16 adds the launch
/// snapshot it gains a second consumer and should move down beside the
/// repository, the way `core::time::iso8601` did.
fn snapshot_destination(live: &Path) -> Option<PathBuf> {
    let directory = live.parent().map(|parent| parent.join(SNAPSHOT_DIR))?;

    if let Err(error) = std::fs::create_dir_all(&directory) {
        tracing::warn!(%error, "could not create the snapshot directory");
        return None;
    }

    // v1's name: the ISO instant with the characters a filesystem dislikes
    // replaced, which keeps the lexicographic order the pruner sorts on.
    let stamp = shiranami_core::time::iso8601::now().replace([':', '.'], "-");

    Some(directory.join(format!("shiranami-{stamp}.db")))
}

/// Keep the newest [`MAX_SNAPSHOTS`] snapshots and unlink the rest.
///
/// Sorted by **name**, which is the same order as by time because the stamp is
/// a fixed-width ISO instant — v1 relied on exactly this.
fn prune_snapshots(directory: &Path) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };

    let mut snapshots: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("shiranami-") && name.ends_with(".db"))
        })
        .collect();

    snapshots.sort();
    let surplus = snapshots.len().saturating_sub(MAX_SNAPSHOTS);
    for stale in snapshots.into_iter().take(surplus) {
        let _ = std::fs::remove_file(stale);
    }
}

/// Delete a path, ignoring every failure including "it was not there".
fn remove_quietly(path: &Path) {
    let _ = std::fs::remove_file(path);
}

#[cfg(test)]
#[path = "db_backup_tests.rs"]
mod tests;
