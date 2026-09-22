//! `background:*` — the saved-background library: add, list, pick, rename,
//! remove.
//!
//! v2-born commands with no v1 channel behind them, so nothing here is a
//! compatibility port. The work lives in
//! [`shiranami_metadata::background`]; this file is the wiring §2.1 says it
//! should be.
//!
//! # The picker opens *here*, and the path never crosses the boundary
//!
//! The obvious shape would be `dialog_open_file` in the renderer followed by
//! `background_add(path)`. That shape is rejected. It would make the renderer
//! the thing that names a file for the backend to read, and the read gate
//! [`crate::paths::ensure_allowed`] cannot cover it: a wallpaper legitimately
//! lives in Pictures, outside every allowed root, so the command would have to
//! opt out of containment entirely and accept any path it was handed.
//!
//! Opening the dialog inside the command closes that: the only path
//! [`background_add`] ever reads is one the user chose in a native picker
//! parented to our own window, and the renderer learns nothing but the content-
//! addressed name of the copy. It is the same reasoning that keeps the webview
//! without a dialog capability at all — see [`crate::commands::dialog`].
//!
//! # One library, two settings keys
//!
//! The library lives under `MainStoreKey::AppearanceBackgroundLibrary`. The
//! pre-library single-record key (`appearance.customBackground`) is *not*
//! retired: [`load_library`] folds a record found there into the library the
//! first time this build touches a pre-library profile, and every mutation
//! mirrors the active entry back into it. A downgraded build therefore keeps
//! showing the user's wallpaper — its sweep collects the entries it cannot
//! see, which the next upgraded boot heals by dropping the dead records.
//!
//! # Write the record, then sweep — never the other way round
//!
//! Persisting first means a crash costs an unreferenced file that the next
//! sweep collects. Deleting first would mean a crash leaves a *record*
//! pointing at a file that is already gone — a broken background the user has
//! to notice and fix. One of those is invisible housekeeping and the other is
//! a bug report.

use std::path::PathBuf;

use shiranami_core::store::{MainStoreKey, SettingsStore};
use shiranami_metadata::background::{
    ALLOWED_EXTENSIONS, BackgroundLibrary, BackgroundLibraryEntry, BackgroundReference,
    CustomBackground, MAX_LABEL_CHARS, MAX_LIBRARY_ENTRIES, background_dir, import_background,
    sweep_orphans,
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt as _;

use crate::error::{CommandResult, WireResultExt as _, bad_request};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::background::background_library_get,
                crate::commands::background::background_add,
                crate::commands::background::background_remove,
                crate::commands::background::background_set_active,
                crate::commands::background::background_rename,
            ]
        }
    };
}
pub(crate) use commands;

/// `background:library-get` — the saved backgrounds, healed against the disk.
///
/// Self-healing like the single-record `background:get` before it: an entry
/// whose main file has vanished (an external delete, a restored profile, a
/// half-copied app-data move) is dropped rather than returned, so the renderer
/// never renders a URL that 404s. An entry whose *still* alone is missing
/// keeps the animation — a preference not honoured rather than a broken
/// screen. The filesystem is the source of truth for existence; the settings
/// entries only name things.
#[tauri::command]
#[specta::specta]
pub async fn background_library_get(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<BackgroundLibrary> {
    let mut library = load_library(state.settings())?;
    if library.entries.is_empty() {
        return Ok(library);
    }

    let directory = background_dir(&crate::paths::data_dir(&app)?);
    let names: Vec<(String, Option<String>)> = library
        .entries
        .iter()
        .map(|entry| {
            (
                entry.background.file_name.clone(),
                entry.background.still_file_name.clone(),
            )
        })
        .collect();
    let existence = blocking("the background existence check", move || {
        names
            .into_iter()
            .map(|(file_name, still)| {
                (
                    directory.join(file_name).is_file(),
                    still.is_none_or(|name| directory.join(name).is_file()),
                )
            })
            .collect::<Vec<_>>()
    })
    .await?;

    let mut changed = false;
    let mut kept = Vec::with_capacity(library.entries.len());
    for (mut entry, (main_exists, still_exists)) in library.entries.into_iter().zip(existence) {
        if !main_exists {
            tracing::warn!(id = %entry.id, "a saved background is gone from disk; dropping it");
            changed = true;
            continue;
        }
        if !still_exists {
            tracing::warn!(id = %entry.id, "a background's poster still is gone; falling back");
            entry.background.still_file_name = None;
            changed = true;
        }
        kept.push(entry);
    }
    library.entries = kept;
    changed |= normalize_active(&mut library);

    if changed {
        persist_library(state.settings(), &library)?;
        mirror_active(state.settings(), &library)?;
    }

    Ok(library)
}

/// `background:add` — choose an image and save it, or `null` if cancelled.
///
/// Cancelling is not an error, matching every other picker in the app: the
/// renderer's "the user changed their mind" branch is an `if`, not a `catch`.
/// A *refusal* is an error, and a specific one — see
/// `shiranami_core::error::codes::background`. The new entry becomes the
/// active pick, because saving an image *is* choosing to look at it.
///
/// `label` is display text supplied by the renderer (it holds the localized
/// default); it never names a file and is trimmed and capped before storage.
#[tauri::command]
#[specta::specta]
pub async fn background_add(
    app: AppHandle,
    window: tauri::Window,
    state: State<'_, AppState>,
    label: String,
) -> CommandResult<Option<BackgroundLibrary>> {
    let mut library = load_library(state.settings())?;
    if library.entries.len() >= MAX_LIBRARY_ENTRIES {
        return Err(library_full());
    }

    let Some(source) = pick_image(&window).await else {
        return Ok(None);
    };

    let data_dir = crate::paths::data_dir(&app)?;
    let record = blocking("the background import", {
        let data_dir = data_dir.clone();
        move || import_background(&data_dir, &source)
    })
    .await?
    .wire()?;

    // `max(1)` keeps ids starting at 1 across the serde default of 0 and the
    // migrated form alike.
    let id = library.next_id.max(1);
    library.next_id = id + 1;
    library.entries.push(BackgroundLibraryEntry {
        id: id.to_string(),
        label: sanitize_label(&label),
        background: record,
    });
    library.active_id = Some(id.to_string());
    persist_library(state.settings(), &library)?;
    mirror_active(state.settings(), &library)?;

    // Only now is anything unreferenced (a crash-orphaned copy, a stale
    // mirror). See the module docs on ordering.
    let references = read_references(state.settings());
    blocking("the background sweep", move || {
        sweep_orphans(&data_dir, &references)
    })
    .await?;

    Ok(Some(library))
}

/// `background:remove` — forget one saved background and delete its files.
///
/// The files go through the sweep rather than a targeted delete, so a file
/// shared with another entry (re-importing the same image converges on one
/// content-addressed copy) survives as long as anything references it.
#[tauri::command]
#[specta::specta]
pub async fn background_remove(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<BackgroundLibrary> {
    let mut library = load_library(state.settings())?;
    let before = library.entries.len();
    library.entries.retain(|entry| entry.id != id);
    if library.entries.len() == before {
        return Err(bad_request(format!("no saved background has id {id}")));
    }
    normalize_active(&mut library);
    persist_library(state.settings(), &library)?;
    mirror_active(state.settings(), &library)?;

    // The record is gone, which is the part the user asked for. Tidying the
    // bytes is housekeeping, so a failure here is logged rather than returned.
    let data_dir = crate::paths::data_dir(&app)?;
    let references = read_references(state.settings());
    match blocking("the background sweep", move || {
        sweep_orphans(&data_dir, &references)
    })
    .await
    {
        Ok(report) => tracing::debug!(deleted = report.deleted, "background removed"),
        Err(error) => tracing::warn!(?error, "the background files were not swept"),
    }

    Ok(library)
}

/// `background:set-active` — pick which saved background is the wallpaper.
#[tauri::command]
#[specta::specta]
pub async fn background_set_active(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<BackgroundLibrary> {
    let mut library = load_library(state.settings())?;
    if !library.entries.iter().any(|entry| entry.id == id) {
        return Err(bad_request(format!("no saved background has id {id}")));
    }
    library.active_id = Some(id);
    persist_library(state.settings(), &library)?;
    mirror_active(state.settings(), &library)?;
    Ok(library)
}

/// `background:rename` — relabel one saved background.
#[tauri::command]
#[specta::specta]
pub async fn background_rename(
    state: State<'_, AppState>,
    id: String,
    label: String,
) -> CommandResult<BackgroundLibrary> {
    let mut library = load_library(state.settings())?;
    let Some(entry) = library.entries.iter_mut().find(|entry| entry.id == id) else {
        return Err(bad_request(format!("no saved background has id {id}")));
    };
    entry.label = sanitize_label(&label);
    persist_library(state.settings(), &library)?;
    Ok(library)
}

/// Every referenced background, for the sweep, distinguishing "none" from
/// "unreadable".
///
/// The union of both settings keys: the library's entries and the legacy
/// single-record mirror. Either failing to parse answers `Unreadable`, which
/// deletes nothing — see [`shiranami_metadata::background::sweep`]. A
/// quarantined document reads absent for *every* key, so it too answers
/// `Unreadable` rather than authorising the deletion of files the quarantined
/// backup still names.
pub(crate) fn read_references(settings: &SettingsStore) -> BackgroundReference {
    if settings.started_from_quarantine() {
        return BackgroundReference::Unreadable;
    }

    let mut records: Vec<CustomBackground> = Vec::new();

    if let Some(value) = settings.get_main(MainStoreKey::AppearanceBackgroundLibrary) {
        match serde_json::from_value::<BackgroundLibrary>(value) {
            Ok(library) => {
                records.extend(library.entries.into_iter().map(|entry| entry.background))
            }
            Err(error) => {
                tracing::warn!(%error, "the stored background library did not parse");
                return BackgroundReference::Unreadable;
            }
        }
    }

    if let Some(value) = settings.get_main(MainStoreKey::AppearanceCustomBackground) {
        match serde_json::from_value::<CustomBackground>(value) {
            Ok(record) => records.push(record),
            Err(error) => {
                tracing::warn!(%error, "the stored background record did not parse");
                return BackgroundReference::Unreadable;
            }
        }
    }

    BackgroundReference::Known(records)
}

/// The library, folding a pre-library single record in as entry 1 on first
/// touch.
///
/// The migrated form is persisted immediately so later reads take the fast
/// path; the legacy key deliberately stays behind as the active-entry mirror
/// (see the module docs). A quarantined document reads absent for every key,
/// so this returns the empty default there and — crucially — persists nothing:
/// the migration branch needs a legacy record to exist, which a quarantined
/// read never produces.
fn load_library(settings: &SettingsStore) -> CommandResult<BackgroundLibrary> {
    if let Some(value) = settings.get_main(MainStoreKey::AppearanceBackgroundLibrary) {
        match serde_json::from_value::<BackgroundLibrary>(value) {
            Ok(library) => return Ok(library),
            Err(error) => {
                // Unreadable is deliberately *not* healed by overwriting.
                // Serving the empty default without persisting it keeps the
                // evidence on disk; the sweep independently refuses to delete
                // behind an unparseable record (see `read_references`).
                tracing::warn!(%error, "the stored background library did not parse");
                return Ok(BackgroundLibrary::default());
            }
        }
    }

    let Some(value) = settings.get_main(MainStoreKey::AppearanceCustomBackground) else {
        return Ok(BackgroundLibrary::default());
    };
    let record = match serde_json::from_value::<CustomBackground>(value) {
        Ok(record) => record,
        Err(error) => {
            tracing::warn!(%error, "the stored background record did not parse");
            return Ok(BackgroundLibrary::default());
        }
    };

    tracing::info!("migrating the single custom background into the library");
    let library = BackgroundLibrary {
        entries: vec![BackgroundLibraryEntry {
            id: "1".to_owned(),
            // Empty on purpose: the backend has no locale, so the renderer
            // shows its localized fallback name for unlabelled entries.
            label: String::new(),
            background: record,
        }],
        active_id: Some("1".to_owned()),
        next_id: 2,
    };
    persist_library(settings, &library)?;
    Ok(library)
}

/// Write the library to its settings key.
fn persist_library(settings: &SettingsStore, library: &BackgroundLibrary) -> CommandResult<()> {
    settings
        .set_main(
            MainStoreKey::AppearanceBackgroundLibrary,
            serde_json::to_value(library).map_err(|error| {
                bad_request(format!("the background library did not serialise: {error}"))
            })?,
        )
        .wire()
}

/// Mirror the active entry into the legacy single-record key.
///
/// The mirror is what a downgraded build reads, so it follows the active pick
/// exactly: present while one exists, absent when the library is empty.
fn mirror_active(settings: &SettingsStore, library: &BackgroundLibrary) -> CommandResult<()> {
    match library.active_entry() {
        Some(entry) => settings
            .set_main(
                MainStoreKey::AppearanceCustomBackground,
                serde_json::to_value(&entry.background).map_err(|error| {
                    bad_request(format!("the background record did not serialise: {error}"))
                })?,
            )
            .wire(),
        None => settings
            .delete_main(MainStoreKey::AppearanceCustomBackground)
            .wire(),
    }
}

/// Re-point `active_id` at a real entry; `true` if it moved.
///
/// The invariant the renderer leans on: while the library is non-empty the
/// active id names an existing entry, and an empty library has none.
fn normalize_active(library: &mut BackgroundLibrary) -> bool {
    let valid = library
        .active_id
        .as_deref()
        .is_some_and(|id| library.entries.iter().any(|entry| entry.id == id));
    if valid || (library.active_id.is_none() && library.entries.is_empty()) {
        return false;
    }
    library.active_id = library.entries.first().map(|entry| entry.id.clone());
    true
}

/// Trim and cap a renderer-supplied label. Display text only — never a path.
fn sanitize_label(label: &str) -> String {
    label.trim().chars().take(MAX_LABEL_CHARS).collect()
}

/// The refusal for an at-capacity library, under its registry code.
fn library_full() -> shiranami_core::error::ErrorPayload {
    shiranami_core::error::ErrorPayload {
        code: shiranami_core::error::codes::background::LIBRARY_FULL.to_owned(),
        message: format!("the background library holds at most {MAX_LIBRARY_ENTRIES} images"),
        details: None,
    }
}

/// Open the native picker, filtered to the formats the importer accepts.
///
/// The filter is advisory — a user can always type a name past it — which is
/// why the importer re-checks the extension and then the bytes behind it.
async fn pick_image(window: &tauri::Window) -> Option<PathBuf> {
    let (sender, mut receiver) = tauri::async_runtime::channel(1);

    window
        .dialog()
        .file()
        .set_parent(window)
        .add_filter("Images", &ALLOWED_EXTENSIONS)
        .pick_file(move |picked| {
            let _ = sender.try_send(picked.and_then(|path| path.into_path().ok()));
        });

    receiver.recv().await.flatten()
}

/// Run blocking disk work off the webview's thread, per §2.3.
async fn blocking<T, F>(what: &'static str, work: F) -> CommandResult<T>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| bad_request(format!("{what} panicked: {error}")))
}
