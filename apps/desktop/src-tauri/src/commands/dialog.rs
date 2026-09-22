//! `dialog:*` — the two native file pickers, plus the save panel the shim needs.
//!
//! Ported from `apps/desktop/src/main/ipc/dialog.ts`. All three resolve to a
//! single path or `null`, which is v1's `result.canceled ? null :
//! result.filePaths[0]`: cancelling is not an error and never was, so the
//! renderer's "the user changed their mind" branch is an `if`, not a `catch`.
//!
//! # The third command ports no v1 channel, and that is the point
//!
//! [`dialog_save_file`] has no entry in `packages/contracts`' channel manifest
//! because v1 never exposed a save panel to the renderer: `db:backup:export`
//! opened `dialog.showSaveDialog` *inside* the main-process handler and the
//! renderer only ever saw the result. §2.6 moves the dialog to the Phase 15
//! shim, and the Phase 14 ports of `db:backup:{export,import}` correspondingly
//! take a path argument — so the panel has to become reachable somehow.
//!
//! The alternative was granting the webview `dialog:allow-save`, and that is
//! the thing this crate deliberately does not do: no dialog capability is
//! granted at all (see `capabilities/default.json` and the Phase 14 lane notes),
//! because Rust-side calls bypass the plugin ACL and a JS permission would hand
//! the webview an unguarded save panel for the sake of one caller. One command
//! with a fixed option struct is a smaller surface than a capability, and it is
//! a surface this file can describe.
//!
//! It is **not** re-exposed on `window.electronAPI.dialog`. The shim's public
//! shape is exactly v1's two methods; the save panel is reachable only from the
//! shim's own `db.backup` implementation.
//!
//! The import half needs no new command: `db:backup:import` picks an *existing*
//! file, which is what [`dialog_open_file`] already does, so the shim passes it
//! the SQLite filters and nothing here changes. The one thing that does not
//! survive is v1's `title: 'Import Library Database'` on that panel — see
//! [`SaveFileOptions::title`] for why the loss is confined to Windows.
//!
//! # Single selection, no default directory — deliberately
//!
//! v1 passed `properties: ['openFile']` and `['openDirectory']` and read
//! `filePaths[0]`. There is no `multiSelections`, no `defaultPath`, and no
//! `title` anywhere in v1's two calls, so there is none here: adding
//! multi-select would change what the *renderer* receives, and every caller
//! (`add a music folder`, `import a standalone file`) is written against one
//! path. `pick_files` and `set_directory` exist on the builder and are
//! deliberately not reached for.
//!
//! # The parent window is what makes the dialog modal
//!
//! v1 passed `mainWindow` to `showOpenDialog`, which on macOS makes it a sheet
//! attached to the window rather than a free-floating panel, and on Windows
//! keeps it in front of the app. Tauri's equivalent is `set_parent`, and the
//! handle comes from the command's own `tauri::Window` parameter.
//!
//! # Why a channel rather than `blocking_pick_file`
//!
//! The blocking builders park the calling thread until the user answers, which
//! can be minutes. On the async runtime that occupies a worker for the whole
//! time; the plugin's own documentation says not to call them from the main
//! thread. The callback form hands the answer back through a one-slot channel,
//! so nothing is held while the dialog is open. `try_send` rather than
//! `blocking_send` because the callback may run on an OS thread with no reactor
//! entered, and the channel has exactly one slot and exactly one sender.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_plugin_dialog::DialogExt as _;

use crate::error::CommandResult;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::dialog::dialog_open_directory,
                crate::commands::dialog::dialog_open_file,
                crate::commands::dialog::dialog_save_file,
            ]
        }
    };
}
pub(crate) use commands;

/// One entry of v1's `Electron.FileFilter`.
///
/// The shape is frozen by the renderer, which builds these itself when it wants
/// something other than audio — the playlist import screen asks for `.m3u`.
/// Extensions are bare (`"mp3"`), never dotted and never globbed, with `"*"`
/// meaning "everything", exactly as Electron defined it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FileFilter {
    /// The label shown in the picker's format dropdown.
    pub name: String,
    /// Extensions without the leading dot.
    pub extensions: Vec<String>,
}

/// The single optional argument `dialog:open-file` takes.
///
/// v1's preload typed this as the whole of Electron's `OpenDialogOptions` while
/// its zod schema accepted only `{ filters? }` and the handler read only that.
/// Non-strict `z.object` dropped the rest silently; serde's default
/// unknown-field handling does the same, so a renderer still passing
/// `properties` or `title` is ignored rather than rejected.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
pub struct OpenFileOptions {
    /// Which formats the picker offers. Absent means audio; see [`filters_for`].
    #[specta(optional)]
    pub filters: Option<Vec<FileFilter>>,
}

/// `dialog:open-directory` — pick one folder, or `null` if cancelled.
#[tauri::command]
#[specta::specta]
pub async fn dialog_open_directory(window: tauri::Window) -> CommandResult<Option<String>> {
    let (sender, mut receiver) = tauri::async_runtime::channel(1);

    window
        .dialog()
        .file()
        .set_parent(&window)
        .pick_folder(move |picked| {
            let _ = sender.try_send(picked.and_then(|path| path.into_path().ok()));
        });

    Ok(receive(receiver.recv().await))
}

/// `dialog:open-file` — pick one file, or `null` if cancelled.
#[tauri::command]
#[specta::specta]
pub async fn dialog_open_file(
    window: tauri::Window,
    options: Option<OpenFileOptions>,
) -> CommandResult<Option<String>> {
    let (sender, mut receiver) = tauri::async_runtime::channel(1);

    let mut builder = window.dialog().file().set_parent(&window);
    for filter in filters_for(options.as_ref()) {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        builder = builder.add_filter(&filter.name, &extensions);
    }

    builder.pick_file(move |picked| {
        let _ = sender.try_send(picked.and_then(|path| path.into_path().ok()));
    });

    Ok(receive(receiver.recv().await))
}

/// The argument [`dialog_save_file`] takes.
///
/// Every field is optional and every one is honoured only when present, because
/// there is no v1 default to fall back on the way [`filters_for`] has one — this
/// panel had exactly one caller and it supplies all three.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileOptions {
    /// The panel's window title.
    ///
    /// Windows renders it. macOS has ignored `NSSavePanel.title` since 10.11 and
    /// ignores `NSOpenPanel.title` too, which is why the import panel losing
    /// v1's title costs nothing there and costs one window caption on Windows.
    #[specta(optional)]
    pub title: Option<String>,
    /// The name the panel opens pre-filled with — v1's `defaultPath`.
    ///
    /// A bare file name, never a path: v1 passed `shiranami-library-<date>.db`
    /// and let the OS choose the directory (the last-used one), and a directory
    /// forced from here would override that.
    #[specta(optional)]
    pub file_name: Option<String>,
    /// Which formats the panel offers.
    ///
    /// Absent means the OS default — *not* [`default_filters`]. This panel is
    /// not for audio, and inheriting the open panel's audio list would offer to
    /// save a database as an `.mp3`.
    #[specta(optional)]
    pub filters: Option<Vec<FileFilter>>,
}

/// `dialog:save-file` — name a file to write, or `null` if cancelled.
///
/// Ports no v1 channel; see the module docs for why it exists and why it is not
/// on `window.electronAPI.dialog`.
///
/// The panel returns a path whether or not anything is there — naming a file is
/// not creating one — so the caller still has to handle a write failure. That is
/// what `db:backup:export` already does.
#[tauri::command]
#[specta::specta]
pub async fn dialog_save_file(
    window: tauri::Window,
    options: Option<SaveFileOptions>,
) -> CommandResult<Option<String>> {
    let (sender, mut receiver) = tauri::async_runtime::channel(1);

    let mut builder = window.dialog().file().set_parent(&window);
    if let Some(options) = options.as_ref() {
        if let Some(title) = options.title.as_deref() {
            builder = builder.set_title(title);
        }
        if let Some(file_name) = options.file_name.as_deref() {
            builder = builder.set_file_name(file_name);
        }
        for filter in options.filters.iter().flatten() {
            let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
            builder = builder.add_filter(&filter.name, &extensions);
        }
    }

    builder.save_file(move |picked| {
        let _ = sender.try_send(picked.and_then(|path| path.into_path().ok()));
    });

    Ok(receive(receiver.recv().await))
}

/// The formats v1 offered when the renderer named none.
///
/// The extension list is a port contract, not a preference: a user whose library
/// is `.opus` sees nothing in the picker if one goes missing, and the picker
/// gives no hint that a filter is why.
fn default_filters() -> Vec<FileFilter> {
    vec![
        FileFilter {
            name: "Audio Files".to_owned(),
            extensions: ["mp3", "flac", "wav", "ogg", "aac", "m4a", "opus", "wma"]
                .map(str::to_owned)
                .to_vec(),
        },
        FileFilter {
            name: "All Files".to_owned(),
            extensions: vec!["*".to_owned()],
        },
    ]
}

/// v1's `options?.filters ?? DEFAULT`.
///
/// The distinction `??` draws is load-bearing and easy to lose: an **absent**
/// filter list means "use the audio default", while an **empty** one is a list
/// the renderer supplied and means "no filtering at all". Collapsing the two —
/// which any `is_empty()` check would — silently re-imposes the audio filter on
/// a caller that deliberately asked for none.
fn filters_for(options: Option<&OpenFileOptions>) -> Vec<FileFilter> {
    options
        .and_then(|options| options.filters.clone())
        .unwrap_or_else(default_filters)
}

/// Collapse "the picker was cancelled" and "the callback was dropped" into the
/// same `null` the renderer already handles.
///
/// The second case should not happen, but a dropped sender would otherwise be
/// indistinguishable from a hang, and there is nothing a user could do about
/// either — v1's `canceled` branch is the honest answer to both.
fn receive(received: Option<Option<std::path::PathBuf>>) -> Option<String> {
    received
        .flatten()
        .map(|path| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_options_at_all_uses_the_audio_defaults() {
        assert_eq!(filters_for(None), default_filters());
    }

    #[test]
    fn options_without_filters_still_uses_the_audio_defaults() {
        assert_eq!(
            filters_for(Some(&OpenFileOptions { filters: None })),
            default_filters()
        );
    }

    /// The `??` case that is not `||`: an explicitly empty list is a choice, and
    /// substituting the defaults for it would override the renderer.
    #[test]
    fn an_explicitly_empty_filter_list_is_honoured_rather_than_defaulted() {
        assert_eq!(
            filters_for(Some(&OpenFileOptions {
                filters: Some(Vec::new())
            })),
            Vec::new()
        );
    }

    #[test]
    fn renderer_supplied_filters_replace_the_defaults_entirely() {
        let supplied = vec![FileFilter {
            name: "Playlists".to_owned(),
            extensions: vec!["m3u".to_owned(), "m3u8".to_owned()],
        }];

        assert_eq!(
            filters_for(Some(&OpenFileOptions {
                filters: Some(supplied.clone())
            })),
            supplied
        );
    }

    /// The eight formats v1 listed, in v1's order — the dropdown's first entry
    /// is what the picker preselects, so order is visible.
    #[test]
    fn the_default_audio_filter_lists_every_format_v1_listed() {
        let defaults = default_filters();

        assert_eq!(defaults[0].name, "Audio Files");
        assert_eq!(
            defaults[0].extensions,
            ["mp3", "flac", "wav", "ogg", "aac", "m4a", "opus", "wma"]
        );
        assert_eq!(defaults[1].name, "All Files");
        assert_eq!(defaults[1].extensions, ["*"]);
    }

    /// The renderer sends `{ filters: [{ name, extensions }] }` and nothing
    /// else. Pinned against the literal JSON because the shim forwards the
    /// argument untouched, so a field rename here is a silently ignored filter
    /// there.
    #[test]
    fn the_option_argument_parses_v1s_shape() {
        let parsed: OpenFileOptions =
            serde_json::from_str(r#"{"filters":[{"name":"Audio","extensions":["mp3"]}]}"#)
                .expect("v1's shape parses");

        assert_eq!(
            parsed.filters.as_deref(),
            Some(
                [FileFilter {
                    name: "Audio".to_owned(),
                    extensions: vec!["mp3".to_owned()],
                }]
                .as_slice()
            )
        );
    }

    /// v1's preload typed the argument as the whole of `OpenDialogOptions` while
    /// its zod schema read only `filters`, and a non-strict `z.object` dropped
    /// the rest. A renderer still passing `properties` must not start failing.
    #[test]
    fn unknown_keys_are_dropped_rather_than_rejected() {
        let parsed: OpenFileOptions =
            serde_json::from_str(r#"{"properties":["openFile"],"title":"Pick"}"#)
                .expect("extra keys are ignored, as z.object ignored them");

        assert_eq!(parsed.filters, None);
    }

    #[test]
    fn a_cancelled_picker_and_a_dropped_callback_both_read_as_null() {
        assert_eq!(receive(None), None, "the callback never fired");
        assert_eq!(receive(Some(None)), None, "the user cancelled");
    }

    #[test]
    fn a_picked_path_comes_back_as_a_native_path_string() {
        let picked = receive(Some(Some(std::path::PathBuf::from("/music/song.mp3"))));

        assert_eq!(picked.as_deref(), Some("/music/song.mp3"));
    }

    /// The shim sends camelCase, because the generated binding does. A field
    /// that arrived snake_case would deserialize to `None` and the export panel
    /// would silently open with no suggested name.
    #[test]
    fn the_save_options_parse_the_shape_the_shim_sends() {
        let parsed: SaveFileOptions = serde_json::from_str(
            r#"{"title":"Export Library Database",
                "fileName":"shiranami-library-2026-08-01.db",
                "filters":[{"name":"SQLite Database","extensions":["db"]}]}"#,
        )
        .expect("the shim's shape parses");

        assert_eq!(parsed.title.as_deref(), Some("Export Library Database"));
        assert_eq!(
            parsed.file_name.as_deref(),
            Some("shiranami-library-2026-08-01.db")
        );
        assert_eq!(
            parsed.filters.as_deref(),
            Some(
                [FileFilter {
                    name: "SQLite Database".to_owned(),
                    extensions: vec!["db".to_owned()],
                }]
                .as_slice()
            )
        );
    }

    /// The save panel must not inherit the open panel's audio list: it would
    /// offer to save a database as an `.mp3`. Pinned as the absence of a
    /// defaulting helper — `filters_for` is deliberately not called for saves.
    #[test]
    fn save_options_do_not_fall_back_to_the_audio_filters() {
        let parsed: SaveFileOptions =
            serde_json::from_str("{}").expect("an empty object parses to all-absent");

        assert_eq!(parsed, SaveFileOptions::default());
        assert_eq!(parsed.filters, None);
        assert_ne!(parsed.filters.unwrap_or_default(), default_filters());
    }
}
