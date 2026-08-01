//! The main window: the environment it hands the webview, and the two hooks
//! nothing else can install.
//!
//! `commands/window.rs` owns what the *renderer* can do to the window — the
//! titlebar's six buttons and compact mode. This module owns what **boot** does
//! to it, which is three things the command layer has no access to: the
//! initialization script, the compact-mode restore, and the `close` handler.
//!
//! # The initialization script answers two questions that cannot wait for a
//! command
//!
//! `apps/web/src/lib/bridge/environment.ts` reads both of these synchronously,
//! at module scope, before React mounts — `@/lib/platform` freezes them into
//! constants and 325 `IS_ELECTRON` reads depend on the answer. An `invoke` is a
//! promise and would arrive far too late.
//!
//! Tauri's `initialization_script` runs before any page script, the same
//! guarantee `__TAURI_INTERNALS__` has, so it is the only mechanism with the
//! right timing.
//!
//! 1. **`window.__SHIRANAMI_E2E__`** — v1 read `SHIRANAMI_E2E` in the main
//!    process and passed the boolean over the contextBridge. The shim's
//!    `isE2eHarness()` already reads this exact global and documents that
//!    "nothing writes it yet; §2.8 step 7 and the new harness are Phase 16's".
//!    This is that write.
//! 2. **`navigator.mediaSession` suppression** — D10. The webview's media
//!    session must not reach the OS, because souvlaki owns that surface and two
//!    claimants produce two entries. §2.7 gives the platform split, and the
//!    macOS half is "just stop setting `navigator.mediaSession.*`" — but the
//!    renderer is 59k lines that this port does not edit, so the reliable place
//!    to enforce it is here, by making the API inert before any of it runs.
//!
//! # Why suppression is a script and not only a browser flag
//!
//! §2.7 specifies `--disable-features=MediaSessionService,…` for Windows, and
//! that flag is real and still wanted — it is what stops the SMTC flyout showing
//! "Microsoft Edge WebView2" (WebView2Feedback#2236). But it is Windows-only and
//! it is a *browser* switch, so it cannot be tested and does not exist on macOS.
//! Neutering the object covers both platforms with one mechanism, and the
//! renderer sees an API that accepts every call and does nothing — which is
//! exactly what `useMediaSession.ts` expects once it becomes an `invoke` shim.

use tauri::{Manager as _, WebviewWindow};

use crate::compact::{Compact, CompactModeState};
use crate::state::AppState;

/// The script Tauri runs before any page script.
///
/// `Object.defineProperty` rather than assignment for both, so a later
/// assignment cannot silently undo them. The mediaSession stub answers every
/// call: `setActionHandler` and `setPositionState` are called unconditionally by
/// the renderer's player, and a `undefined` property there would be a
/// `TypeError` on the first track rather than a quiet no-op.
pub fn initialization_script(e2e: bool) -> String {
    format!(
        r#"(function () {{
  Object.defineProperty(window, '__SHIRANAMI_E2E__', {{
    value: {e2e},
    writable: false,
    configurable: false,
  }});

  // D10 / §2.7: the OS media surface belongs to souvlaki. A webview that also
  // claims it produces two entries on Windows, one of them labelled
  // "Microsoft Edge WebView2" (WebView2Feedback#2236, permanent). On macOS
  // WKWebView never bridged mediaSession at all, so this costs nothing there
  // and keeps one mechanism across both platforms.
  //
  // Inert rather than absent: the renderer calls `setActionHandler` and
  // `setPositionState` unconditionally, and removing the object would turn
  // every track change into a TypeError.
  var inert = {{
    metadata: null,
    playbackState: 'none',
    setActionHandler: function () {{}},
    setPositionState: function () {{}},
    setCameraActive: function () {{}},
    setMicrophoneActive: function () {{}},
  }};
  try {{
    Object.defineProperty(navigator, 'mediaSession', {{
      value: inert,
      writable: false,
      configurable: false,
    }});
  }} catch (error) {{
    // A webview that refuses to redefine it is not a reason to fail a launch;
    // the OS-side consequence is a duplicate entry, not a broken player.
    console.warn('[shiranami] could not suppress mediaSession', error);
  }}
}})();"#
    )
}

/// Install the two hooks that must exist before the user can touch the window.
///
/// Called once, at the end of boot, after `AppState` is managed — the close
/// handler reads the settings store through it.
pub fn configure(window: &WebviewWindow) {
    let base = window.as_ref().window();

    // `window:maximized-change` is derived rather than delivered: Tauri has no
    // maximize event, so the titlebar's restore icon depends on this hook.
    crate::commands::window::forward_maximized_changes(&base);

    install_close_handler(window);
    restore_compact_mode(window);
}

/// v1's `mainWindow.on('close', persistCompactBounds)`.
///
/// Lane 6 made the function `pub` and left it without a caller, naming the
/// reason: quitting from compact mode — the taskbar, Alt+F4, a system shortcut —
/// bypasses the explicit exit path and loses the corner the user parked the
/// mini-player in.
fn install_close_handler(window: &WebviewWindow) {
    let app = window.app_handle().clone();
    let base = window.as_ref().window();

    base.clone().on_window_event(move |event| {
        if !matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
            return;
        }

        // Both are managed by the time this can fire, but a `try_state` keeps a
        // close during a failed boot from panicking on the way out.
        let (Some(state), Some(compact)) = (
            app.try_state::<AppState>(),
            app.try_state::<CompactModeState>(),
        ) else {
            return;
        };

        crate::commands::window::persist_compact_bounds(&base, state.settings(), compact.get());
    });
}

/// Put the window back into compact mode if that is how it was left.
///
/// v1 restored only the mini-player's **corner**, never the main window's
/// bounds — `window-bounds` exists in its store schema and its renderer
/// allowlist and is read by nothing in the main process. That asymmetry is
/// preserved rather than tidied: a main window that reopened at its last size
/// would be a new behaviour, and this phase ports rather than designs.
///
/// So this is deliberately narrow. The corner itself is applied by
/// `window:set-compact-mode` when the renderer restores its own compact-mode
/// preference, using `crate::compact::valid_compact_position` — which validates
/// against every monitor's work area, so a mini-player parked on a display that
/// is no longer attached comes back on-screen instead of off it.
fn restore_compact_mode(window: &WebviewWindow) {
    let Some(state) = window.app_handle().try_state::<CompactModeState>() else {
        return;
    };

    // Boot always starts out of compact mode; the renderer asks for it if its
    // persisted preference says so. Recorded explicitly so the state machine's
    // "already compact" branch cannot be entered by a stale default.
    state.set(Compact::default());
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The shim reads `window.__SHIRANAMI_E2E__` and compares it with `=== true`
    /// (`bridge/environment.ts`), so the script has to emit a real boolean
    /// literal rather than a string.
    #[test]
    fn the_script_writes_a_boolean_the_shim_can_compare_strictly() {
        assert!(initialization_script(true).contains("value: true"));
        assert!(initialization_script(false).contains("value: false"));

        for script in [initialization_script(true), initialization_script(false)] {
            assert!(!script.contains("value: 'true'"), "never a string");
            assert!(script.contains("__SHIRANAMI_E2E__"));
        }
    }

    /// D10: the media session is neutered on both platforms.
    #[test]
    fn the_script_suppresses_the_webview_media_session() {
        let script = initialization_script(false);

        assert!(script.contains("navigator"), "it targets navigator");
        assert!(script.contains("mediaSession"));
        assert!(
            script.contains("setActionHandler"),
            "the stub has to answer the calls the renderer makes unconditionally"
        );
        assert!(script.contains("setPositionState"));
    }

    /// Inert, not absent. Deleting the property would make the renderer's
    /// unconditional `setActionHandler` a TypeError on the first track, which is
    /// a far worse failure than a duplicate OS entry.
    #[test]
    fn the_media_session_is_replaced_rather_than_deleted() {
        let script = initialization_script(false);

        assert!(!script.contains("delete navigator.mediaSession"));
        assert!(script.contains("Object.defineProperty(navigator, 'mediaSession'"));
    }

    /// Both globals are non-writable, so a later assignment — by the renderer or
    /// by anything injected into it — cannot undo either one.
    #[test]
    fn neither_global_can_be_reassigned() {
        let script = initialization_script(true);

        assert_eq!(
            script.matches("writable: false").count(),
            2,
            "the E2E flag and the media session are both locked"
        );
    }
}
