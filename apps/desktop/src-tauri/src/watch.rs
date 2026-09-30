//! Live folder watching, wired into the app (v2 feature wave, F10).
//!
//! `shiranami_library::watch` does the watching and knows nothing about Tauri,
//! the database or the settings file. This module is the composition around it:
//! which folders to watch (the `folders` table, minus the user's opt-outs), when
//! to re-read that set, where a batch goes (`library:folders-changed`), and when
//! to stop.
//!
//! # When the root set is re-read
//!
//! - once after boot, from [`install`];
//! - after every `db:folders` add or remove, from
//!   `crate::folders::invalidate_after_change`, the hook those commands already
//!   call for the audio route's allowlist;
//! - when the user flips either watch setting, from a settings-bus listener.
//!
//! # The settings live in the renderer's `settings` blob
//!
//! For the reason `boot::services::SAVE_FETCHED_LYRICS_FIELD` gives in full: a
//! dedicated store key would have to be added to v1's Electron allowlist too,
//! and a field inside the already-allowlisted blob needs no schema change on
//! either side. The renderer spells the same two names in
//! `apps/web/src/hooks/queries/useFolderWatchPrefs.ts`.
//!
//! The default is **on**, so only an explicit `false` turns watching off. That
//! is the opposite of the lyrics write-back rule on purpose: that setting writes
//! into the user's folders and must be opted into, while this one only reads
//! them, and a library that silently stops noticing new music is the failure
//! the feature exists to remove.
//!
//! # Not under the E2E harness
//!
//! §2.8 step 7 turns off every background OS integration for `SHIRANAMI_E2E=1`
//! runs, and a watcher firing rescans behind a scripted test is exactly the
//! nondeterminism that list exists to prevent.

use std::collections::HashSet;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use shiranami_core::models::WatchedFolder;
use shiranami_core::store::RendererStoreKey;
use shiranami_library::watch::{FolderWatcher, Timing, WatchRoot};
use specta::Type;
use tauri::{AppHandle, Manager as _};
use tauri_specta::Event as _;

use crate::state::AppState;

/// The field in the renderer `settings` blob that turns watching on or off.
pub const WATCH_FOLDERS_FIELD: &str = "watchFolders";

/// The field in the renderer `settings` blob listing folder ids not to watch.
pub const WATCH_FOLDERS_EXCLUDED_FIELD: &str = "watchFoldersExcluded";

/// The payload of `library:folders-changed`: which registered folders changed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FoldersChanged {
    /// `folders.id` of every folder in the batch.
    pub folder_ids: Vec<String>,
}

/// The two watch settings, read out of the renderer blob.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchPrefs {
    /// Whether any folder is watched.
    pub enabled: bool,
    /// Folder ids the user opted out of watching.
    pub excluded: HashSet<String>,
}

impl WatchPrefs {
    /// Read the prefs from the blob. See the module docs for the default.
    pub fn from_blob(blob: Option<&Value>) -> Self {
        let enabled = blob
            .and_then(|blob| blob.get(WATCH_FOLDERS_FIELD))
            .and_then(Value::as_bool)
            .unwrap_or(true);
        let excluded = blob
            .and_then(|blob| blob.get(WATCH_FOLDERS_EXCLUDED_FIELD))
            .and_then(Value::as_array)
            .map(|ids| {
                ids.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default();
        Self { enabled, excluded }
    }

    /// The roots to watch for `folders` under these prefs.
    pub fn roots(&self, folders: &[WatchedFolder]) -> Vec<WatchRoot> {
        if !self.enabled {
            return Vec::new();
        }
        folders
            .iter()
            .filter(|folder| !self.excluded.contains(&folder.id))
            .map(|folder| WatchRoot {
                id: folder.id.clone(),
                path: folder.path.clone().into(),
            })
            .collect()
    }
}

/// The running watcher, as managed state.
pub struct FolderWatch {
    watcher: FolderWatcher,
    /// Serialises [`refresh`], so two overlapping re-reads (a folder added
    /// while the setting is toggled) cannot apply their answers out of order.
    refreshing: tokio::sync::Mutex<()>,
}

/// Start the watcher and point it at the registered folders.
///
/// Called once from `setup()`, after the managed state exists. A watcher that
/// cannot start is logged and the app carries on without it: the Rescan button
/// is the fallback, and it always was.
pub fn install(app: &AppHandle, e2e: bool) {
    if e2e {
        tracing::info!("E2E run: not watching music folders");
        return;
    }
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };

    let emitter = app.clone();
    let sink = Box::new(move |folder_ids: Vec<String>| {
        // A failed emit means the window is gone, and the next batch will say
        // the same thing again.
        let _ = crate::events::LibraryFoldersChanged(FoldersChanged { folder_ids }).emit(&emitter);
    });

    let watcher = match FolderWatcher::start_native(Timing::DEFAULT, sink) {
        Ok(watcher) => watcher,
        Err(error) => {
            tracing::warn!(%error, "music folders will not be watched");
            return;
        }
    };
    app.manage(Arc::new(FolderWatch {
        watcher,
        refreshing: tokio::sync::Mutex::new(()),
    }));

    // Re-read only when a watch setting actually changed: the blob is written
    // for every renderer preference, and each re-read is a database query.
    let listener = app.clone();
    state
        .settings()
        .bus()
        .subscribe(RendererStoreKey::Settings.path(), move |event| {
            let before = WatchPrefs::from_blob(event.previous.as_ref());
            let after = WatchPrefs::from_blob(event.current.as_ref());
            if before != after {
                spawn_refresh(&listener);
            }
        });

    spawn_refresh(app);
}

/// [`refresh`] on the async runtime, for callers that cannot await.
pub fn spawn_refresh(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { refresh(&app).await });
}

/// Re-read the folders and the prefs and hand the watcher the result.
///
/// A no-op when the watcher is not running (E2E, a watcher that failed to
/// start, every pre-boot test). A failed folders read keeps the previous roots
/// rather than dropping them all, the same choice `crate::folders` makes for
/// the audio route's allowlist.
pub async fn refresh(app: &AppHandle) {
    let Some(watch) = app.try_state::<Arc<FolderWatch>>() else {
        return;
    };
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let _serial = watch.refreshing.lock().await;

    let prefs = WatchPrefs::from_blob(state.settings().get(RendererStoreKey::Settings).as_ref());
    if !prefs.enabled {
        watch.watcher.set_roots(Vec::new());
        return;
    }

    let folders = match state.conn().await {
        Ok(mut conn) => shiranami_db::repo::folders::get_all(&mut conn).await,
        Err(error) => {
            tracing::warn!(?error, "could not read the music folders to watch");
            return;
        }
    };
    match folders {
        Ok(folders) => watch.watcher.set_roots(prefs.roots(&folders)),
        Err(error) => tracing::warn!(%error, "could not read the music folders to watch"),
    }
}

/// Stop the watcher and wait for its thread. Called on exit.
pub fn stop(app: &AppHandle) {
    if let Some(watch) = app.try_state::<Arc<FolderWatch>>() {
        watch.watcher.stop();
        tracing::info!("the folder watcher is stopped");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn folder(id: &str, path: &str) -> WatchedFolder {
        WatchedFolder {
            id: id.to_owned(),
            path: path.to_owned(),
            last_scanned: None,
            created_at: "2026-09-28T00:00:00.000Z".to_owned(),
        }
    }

    #[test]
    fn watching_is_on_unless_the_user_turned_it_off() {
        assert!(WatchPrefs::from_blob(None).enabled, "no settings file yet");
        assert!(
            WatchPrefs::from_blob(Some(&json!({}))).enabled,
            "never touched"
        );
        assert!(
            WatchPrefs::from_blob(Some(&json!({ "watchFolders": "no" }))).enabled,
            "only an explicit false turns it off"
        );
        assert!(!WatchPrefs::from_blob(Some(&json!({ "watchFolders": false }))).enabled);
    }

    #[test]
    fn the_roots_follow_the_folders_minus_the_opt_outs() {
        let folders = [folder("a", "/music/a"), folder("b", "/music/b")];
        let prefs = WatchPrefs::from_blob(Some(&json!({ "watchFoldersExcluded": ["b", 7] })));

        assert_eq!(
            prefs.roots(&folders),
            [WatchRoot {
                id: "a".to_owned(),
                path: "/music/a".into(),
            }]
        );
    }

    #[test]
    fn turning_watching_off_watches_nothing() {
        let folders = [folder("a", "/music/a")];
        let prefs = WatchPrefs::from_blob(Some(&json!({ "watchFolders": false })));

        assert!(prefs.roots(&folders).is_empty());
    }

    /// The renderer destructures `folderIds`, so the key is pinned as JSON
    /// rather than trusted to the `camelCase` attribute.
    #[test]
    fn the_event_payload_keeps_its_keys() {
        let json = serde_json::to_value(crate::events::LibraryFoldersChanged(FoldersChanged {
            folder_ids: vec!["a".to_owned()],
        }))
        .expect("serialize");

        assert_eq!(json, json!({ "folderIds": ["a"] }));
    }
}
