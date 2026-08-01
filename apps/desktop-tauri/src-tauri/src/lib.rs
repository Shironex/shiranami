//! Composition root for the Shiranami desktop shell.
//!
//! This crate is wiring only: it registers plugins, builds managed state and
//! exposes the command surface. All behaviour lives in the `shiranami-*`
//! crates, which is why every one of them is a dependency here and none of
//! them depends on this crate.
//!
//! Boot order is load-bearing (`docs/v2/architecture.md` §2.8). Phase 1
//! establishes only the first rung of it — single-instance before anything
//! else — and later phases insert login-PATH hydration, consent-gated Sentry,
//! the remaining plugins and the `setup()` sequence around it.

pub mod arch_guards;
pub mod bindings;
pub mod commands;
pub mod error;
pub mod events;
pub mod seam;
pub mod state;
pub mod wire;

use tauri::Manager as _;

/// Builds and runs the desktop shell. Blocks until the app exits.
///
/// # What is deliberately missing
///
/// [`state::AppState`] is not managed here. Building it means opening the
/// database, which §2.8 orders **after** logging, settings and the first-run
/// data continuity pass — and doing it wrong is the "where did my library go?"
/// failure mode, not a startup hiccup. Phase 16 owns that sequence and is where
/// `app.manage(…)` lands, inside a `setup()` wrapped in the `BootTimer`.
///
/// Until then every command that takes `State<'_, AppState>` is registered and
/// typed but answers with Tauri's "state not managed" error at runtime. That is
/// the honest intermediate state: the surface is real and the bindings are
/// generated from it, so the Phase 15 shim and the fan-out lanes have something
/// to build against, and nothing pretends to have booted.
pub fn run() {
    // One builder, shared: `invoke_handler` and `mount_events` must come from
    // the same instance the bindings were exported from, or the renderer calls
    // names the handler does not answer to.
    let specta = bindings::builder();

    tauri::Builder::default()
        // Single-instance is registered first: the plugin requires it, and two
        // processes racing `shiranami.db` and the settings file is a data-loss
        // bug, not a cosmetic one. A second launch focuses the live window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app);
        }))
        .invoke_handler(specta.invoke_handler())
        .setup(move |app| {
            // Required for the typed events to be addressable from the webview.
            specta.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start the Shiranami desktop shell");
}

/// Brings the existing main window back to the foreground.
fn focus_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    // A window that refuses to focus is not worth aborting a launch over.
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}
