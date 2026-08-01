//! `shell:*` — the two OS actions the renderer may take on a file it can name.
//!
//! Ported from `apps/desktop/src/main/ipc/shell.ts`. Two channels, and both are
//! guarded, which is the whole substance of this module: the argument is a
//! renderer-supplied string, and `shell:trash-file` without containment is
//! "delete any file on this machine" behind one unvalidated parameter.
//!
//! # The guard is the port, not a decoration on it
//!
//! v1 called `isPathAllowed` first, logged a warning on refusal, and threw
//! `IpcError(FORBIDDEN, 'Path is not within an allowed root', { path })`. All
//! four parts survive — the check, the warning, the code, and the ordering —
//! in [`crate::paths::ensure_allowed`], which is where the audio route and the
//! storage namespace reach for the same rule rather than restating it. The one
//! difference is the payload's `details`: core's [`PathNotAllowed`] renders the
//! path into the *message* instead, so the renderer sees it either way.
//!
//! [`PathNotAllowed`]: shiranami_core::CoreError::PathNotAllowed
//!
//! # There is no `shell:open-external` to port
//!
//! Worth stating, because it is the channel one expects to find and its absence
//! looks like an omission. v1 has exactly these two `shell:*` channels;
//! everything that opens a URL goes through `share:*` or the updater, and §12's
//! `integrations::share` returns the URL for the caller to open rather than
//! opening it. So `shiranami_net::is_http_url` has no call site here — the two
//! arguments this namespace takes are filesystem paths, and a URL guard applied
//! to a path would refuse every one of them.
//!
//! # Both are `spawn_blocking`, and neither is optional about it
//!
//! `reveal_item_in_dir` spawns a file manager (and does COM initialisation on
//! Windows); `trash::delete` performs a real filesystem move, and on Windows an
//! `IFileOperation` round trip. §2.3 R15 keeps both off the thread answering the
//! invoke.

use tauri::State;
use tauri_plugin_opener::OpenerExt as _;

use crate::error::CommandResult;
use crate::paths::{ensure_allowed, io_failure};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::shell::shell_show_in_folder,
                crate::commands::shell::shell_trash_file,
            ]
        }
    };
}
pub(crate) use commands;

/// `shell:show-in-folder` — reveal a file in the OS file manager.
#[tauri::command]
#[specta::specta]
pub async fn shell_show_in_folder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    file_path: String,
) -> CommandResult<()> {
    let path = ensure_allowed(&app, &state, &file_path).await?;
    let reported = path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        app.opener()
            .reveal_item_in_dir(&path)
            .map_err(|error| io_failure("reveal", &path, error))
    })
    .await
    .map_err(|error| io_failure("reveal", &reported, error))?
}

/// `shell:trash-file` — move a file to the recycle bin.
///
/// The recycle bin, never an unlink: v1 used `shell.trashItem`, so a mistaken
/// delete has always been recoverable from the OS, and `trash` is the crate that
/// keeps that true on all three platforms.
#[tauri::command]
#[specta::specta]
pub async fn shell_trash_file(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    file_path: String,
) -> CommandResult<()> {
    let path = ensure_allowed(&app, &state, &file_path).await?;
    let reported = path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        trash::delete(&path).map_err(|error| io_failure("move to the recycle bin", &path, error))
    })
    .await
    .map_err(|error| io_failure("move to the recycle bin", &reported, error))?
}

#[cfg(test)]
mod tests {
    //! The guard these two commands are made of is tested in
    //! [`crate::paths`] — against the real [`FoldersCache`], including the
    //! symlink escape and the standalone-import fallback — because that is
    //! where it lives and where the audio route will reach it from. What is
    //! left here is the pair of properties that are about *this* module: that
    //! the refusal happens before the OS call, and that the OS call is the one
    //! v1 made.
    //!
    //! [`FoldersCache`]: shiranami_core::paths::FoldersCache

    /// This module's code, without its comments and without this test module.
    ///
    /// Both exclusions are load-bearing. The comments *discuss* the calls being
    /// searched for, and the tests below name them in string literals — a scan
    /// over the whole file would find its own assertions and pass no matter what
    /// the commands do. The same lesson `crate::arch_guards` records.
    fn implementation() -> String {
        let source = include_str!("shell.rs");
        let end = source
            .find(concat!("#[cfg(", "test)]"))
            .expect("the test module is where the implementation ends");

        source[..end]
            .lines()
            .filter(|line| !line.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// `trash::delete` is reversible and `std::fs::remove_file` is not, and the
    /// two are one identifier apart. Asserted against the source because there
    /// is no way to observe a recycle bin from a unit test, and "the delete
    /// became permanent" is a bug whose report arrives as lost music.
    #[test]
    fn deletion_goes_to_the_recycle_bin_rather_than_unlinking() {
        let code = implementation();

        assert!(code.contains("trash::delete"), "the scan reaches the command");
        assert!(
            !code.contains(concat!("remove_", "file")) && !code.contains(concat!("remove_", "dir")),
            "a direct unlink here would make `shell:trash-file` irreversible"
        );
    }

    /// The ordering v1 had: nothing touches the OS until the path has passed.
    /// A refactor that hoisted the `spawn_blocking` above the guard would still
    /// compile and still reject — after having already revealed or deleted.
    #[test]
    fn the_guard_runs_before_the_os_call_in_both_commands() {
        let source = implementation();

        for command in ["shell_show_in_folder", "shell_trash_file"] {
            let start = source
                .find(&format!("pub async fn {command}"))
                .expect("the command is declared");
            let body = &source[start..];
            let end = body.find("\n}").expect("the body ends");
            let body = &body[..end];

            let guard = body
                .find("ensure_allowed")
                .unwrap_or_else(|| panic!("{command} does not call the guard at all"));
            let effect = body
                .find("spawn_blocking")
                .unwrap_or_else(|| panic!("{command} does not reach the OS"));

            assert!(
                guard < effect,
                "{command} reaches the OS before validating its path"
            );
        }
    }
}
