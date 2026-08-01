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

pub mod commands;

use tauri::Manager as _;

/// Builds and runs the desktop shell. Blocks until the app exits.
pub fn run() {
    tauri::Builder::default()
        // Single-instance is registered first: the plugin requires it, and two
        // processes racing `shiranami.db` and the settings file is a data-loss
        // bug, not a cosmetic one. A second launch focuses the live window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app);
        }))
        .invoke_handler(tauri::generate_handler![commands::health::health_check])
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
