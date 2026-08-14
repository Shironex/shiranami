//! `background:*` — import, read and clear the user's custom app background.
//!
//! Three v2-born commands with no v1 channel behind them, so nothing here is a
//! compatibility port. The work lives in
//! [`shiranami_metadata::background`]; this file is the wiring §2.1 says it
//! should be.
//!
//! # The picker opens *here*, and the path never crosses the boundary
//!
//! The obvious shape would be `dialog_open_file` in the renderer followed by
//! `background_set(path)`. That shape is rejected. It would make the renderer
//! the thing that names a file for the backend to read, and the read gate
//! [`crate::paths::ensure_allowed`] cannot cover it: a wallpaper legitimately
//! lives in Pictures, outside every allowed root, so the command would have to
//! opt out of containment entirely and accept any path it was handed.
//!
//! Opening the dialog inside the command closes that: the only path
//! [`background_pick`] ever reads is one the user chose in a native picker
//! parented to our own window, and the renderer learns nothing but the content-
//! addressed name of the copy. It is the same reasoning that keeps the webview
//! without a dialog capability at all — see [`crate::commands::dialog`].
//!
//! # Write the record, then sweep — never the other way round
//!
//! Importing a replacement leaves the previous wallpaper on disk, and the order
//! the two steps run in decides which failure a crash produces. Persisting first
//! means a crash costs an unreferenced file that the next sweep collects.
//! Deleting first would mean a crash leaves the *record* pointing at a file that
//! is already gone — a broken background the user has to notice and fix. One of
//! those is invisible housekeeping and the other is a bug report.

use std::path::PathBuf;

use shiranami_core::store::{MainStoreKey, SettingsStore};
use shiranami_metadata::background::{
    ALLOWED_EXTENSIONS, BackgroundReference, CustomBackground, background_dir, import_background,
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
                crate::commands::background::background_pick,
                crate::commands::background::background_get,
                crate::commands::background::background_clear,
            ]
        }
    };
}
pub(crate) use commands;

/// `background:pick` — choose an image and adopt it, or `null` if cancelled.
///
/// Cancelling is not an error, matching every other picker in the app: the
/// renderer's "the user changed their mind" branch is an `if`, not a `catch`.
/// A *refusal* is an error, and a specific one — see
/// `shiranami_core::error::codes::background`.
#[tauri::command]
#[specta::specta]
pub async fn background_pick(
    app: AppHandle,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> CommandResult<Option<CustomBackground>> {
    let Some(source) = pick_image(&window).await else {
        return Ok(None);
    };

    let data_dir = crate::paths::data_dir(&app)?;
    let settings = std::sync::Arc::clone(state.settings());

    let record = blocking("the background import", {
        let data_dir = data_dir.clone();
        move || import_background(&data_dir, &source)
    })
    .await?
    .wire()?;

    settings
        .set_main(
            MainStoreKey::AppearanceCustomBackground,
            serde_json::to_value(&record).map_err(|error| {
                bad_request(format!("the background record did not serialise: {error}"))
            })?,
        )
        .wire()?;

    // Only now is the predecessor unreferenced. See the module docs on ordering.
    let swept = record.clone();
    blocking("the background sweep", move || {
        sweep_orphans(&data_dir, &BackgroundReference::Known(Some(swept)))
    })
    .await?;

    Ok(Some(record))
}

/// `background:get` — the current background, if one is set and still on disk.
///
/// Self-healing: a record naming a file that has vanished (an external delete, a
/// restored profile, a half-copied app-data move) is removed rather than
/// returned, so the renderer never has to render a URL that 404s. The filesystem
/// is the source of truth for existence; the settings entry only names things.
#[tauri::command]
#[specta::specta]
pub async fn background_get(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Option<CustomBackground>> {
    let BackgroundReference::Known(Some(mut record)) = read_record(state.settings()) else {
        // Unreadable is deliberately *not* healed. Deleting a value this process
        // could not parse would destroy the only evidence of what went wrong, and
        // the cost of keeping it is one background that does not paint.
        return Ok(None);
    };

    // Both files are checked, not just the main one. A record whose *still* has
    // gone missing is the worse shape of the two: the renderer would resolve to
    // it under reduced motion, paint a URL that 404s, and still report that a
    // background exists — scrim and chrome rules over nothing. Dropping the
    // stale name degrades that to "the animation plays", which is a preference
    // not honoured rather than a broken screen.
    let directory = background_dir(&crate::paths::data_dir(&app)?);
    let names = (record.file_name.clone(), record.still_file_name.clone());
    let (main_exists, still_exists) = blocking("the background existence check", move || {
        let (file_name, still) = names;
        (
            directory.join(file_name).is_file(),
            still.is_none_or(|name| directory.join(name).is_file()),
        )
    })
    .await?;

    if !main_exists {
        tracing::warn!("the imported background is gone from disk; clearing the record");
        state
            .settings()
            .delete_main(MainStoreKey::AppearanceCustomBackground)
            .wire()?;
        return Ok(None);
    }

    if !still_exists {
        tracing::warn!("the background's poster still is gone; falling back to the animation");
        record.still_file_name = None;
    }

    Ok(Some(record))
}

/// `background:clear` — forget the background and delete its files.
#[tauri::command]
#[specta::specta]
pub async fn background_clear(app: AppHandle, state: State<'_, AppState>) -> CommandResult<()> {
    state
        .settings()
        .delete_main(MainStoreKey::AppearanceCustomBackground)
        .wire()?;

    // The record is gone, which is the part the user asked for and the part that
    // decides what the app shows. Tidying the bytes is housekeeping, so a
    // failure here is logged rather than returned: answering "the background
    // could not be removed" after it demonstrably has been would leave the
    // renderer holding a record the backend no longer has.
    let data_dir = crate::paths::data_dir(&app)?;
    match blocking("the background sweep", move || {
        sweep_orphans(&data_dir, &BackgroundReference::Known(None))
    })
    .await
    {
        Ok(report) => tracing::debug!(deleted = report.deleted, "background cleared"),
        Err(error) => tracing::warn!(?error, "the background files were not swept"),
    }

    Ok(())
}

/// Read the stored record, distinguishing "unset" from "unreadable".
///
/// The two are the same `Option` to a naive reader and must never be the same
/// answer to the sweep — see [`shiranami_metadata::background::sweep`], where
/// one of them deletes files and the other refuses to.
pub(crate) fn read_record(settings: &SettingsStore) -> BackgroundReference {
    // A quarantined document reads absent for *every* key, so "no background is
    // set" and "the settings file was corrupt this boot" are indistinguishable
    // below — and one of them authorises deleting the user's wallpaper while the
    // quarantined backup beside it still names the file. Answering `Unreadable`
    // is the same refusal the album-art prune makes when its lookup fails.
    if settings.started_from_quarantine() {
        return BackgroundReference::Unreadable;
    }

    let Some(value) = settings.get_main(MainStoreKey::AppearanceCustomBackground) else {
        return BackgroundReference::Known(None);
    };

    match serde_json::from_value::<CustomBackground>(value) {
        Ok(record) => BackgroundReference::Known(Some(record)),
        Err(error) => {
            tracing::warn!(%error, "the stored background record did not parse");
            BackgroundReference::Unreadable
        }
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
