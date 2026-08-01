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

/// §3.5's `localStorage` seed, as an initialization script — or `None` when
/// there is nothing to seed.
///
/// Electron's Chromium partition, WKWebView's WebKit store and WebView2's store
/// are three separate origins, so every `shiranami.*` key a returning user had
/// — theme, accent, sidebar layout, grid sizes, the onboarding flag — resets on
/// the first v2 launch. The v1.x bridge dumps them to `renderer-state.json`
/// (§4.1's "data prep"); this puts them back.
///
/// # Nothing is ever overwritten
///
/// Each key is written only when `localStorage` has no value for it. That makes
/// the script idempotent — it runs on *every* launch, not just the first,
/// because the dump stays in the data directory — and means a preference the
/// user changes in v2 is never reverted by the v1 snapshot on the next start.
/// The alternative, consuming the file after one run, would lose the seed
/// entirely if the first launch crashed before the renderer stored anything.
///
/// # The onboarding fallback, and what already covers it
///
/// §3.5 asks for `onboardingComplete` to be re-derived from a populated library
/// even when the dump is absent. Most of that need turns out to be met already:
/// `useOnboardingStore` and `useSupportBannerStore` both mirror to the settings
/// store (`app.onboardingCompleted`, `app.supportBannerSeen`) and re-read it on
/// boot through `hydrateOnboarding`, so migrating `config.json` restores both
/// without any help from here. What that misses is a v1 user whose mirror was
/// never written, so the fallback below seeds the flag whenever a v1 library was
/// actually copied — a returning user, by definition. It is derived from the
/// migration outcome rather than from a track count because this script is built
/// before the database stage; a library that migrated at all is the same
/// population.
pub fn renderer_seed_script(
    data_dir: &std::path::Path,
    outcome: &shiranami_core::migrate::Outcome,
) -> Option<String> {
    let dump = shiranami_core::migrate::RendererState::read(data_dir);
    let entries: Vec<(String, String)> = dump
        .as_ref()
        .map(|state| {
            state
                .seedable()
                .map(|(key, value)| (key.to_owned(), value.to_owned()))
                .collect()
        })
        .unwrap_or_default();

    let onboarding = outcome.carries_a_v1_library();
    if entries.is_empty() && !onboarding {
        return None;
    }

    // `serde_json` does the escaping. Hand-quoting a value that is itself JSON —
    // which every zustand slice is — is how a stray backslash becomes a syntax
    // error in a script that runs before any page code, taking the whole app
    // with it.
    let seeds = entries
        .iter()
        .filter_map(|(key, value)| {
            Some(format!(
                "    seed({}, {});\n",
                serde_json::to_string(key).ok()?,
                serde_json::to_string(value).ok()?
            ))
        })
        .collect::<String>();

    // Matches `useOnboardingStore`'s persisted shape: zustand's `persist`
    // wrapper stores `{ state, version }`, and `partialize` keeps exactly one
    // field. Written through the same never-overwrite `seed` helper, so a dump
    // that already carried the real slice wins over this reconstruction.
    let fallback = if onboarding {
        "    seed('shiranami.onboarding', '{\"state\":{\"hasCompletedOnboarding\":true},\"version\":1}');\n"
    } else {
        ""
    };

    Some(format!(
        r#"(function () {{
  // Architecture §3.5: the v1 renderer's localStorage, put back after the
  // move from Chromium's partition to this webview's.
  function seed(key, value) {{
    try {{
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    }} catch (error) {{
      console.warn('[shiranami] could not seed', key, error);
    }}
  }}
{seeds}{fallback}}})();"#
    ))
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
    use shiranami_core::migrate::{Migrated, Outcome};

    fn migrated() -> Outcome {
        Outcome::Migrated(Migrated {
            copied_bytes: 1,
            v1_version: None,
            resumed: false,
        })
    }

    fn dump(dir: &std::path::Path, body: &str) {
        std::fs::write(dir.join("renderer-state.json"), body).expect("write the dump");
    }

    /// The seed puts the v1 keys back, and puts them back *verbatim* — a zustand
    /// slice is itself JSON, so the value is a string containing quotes and
    /// braces and must survive into the script escaped rather than interpolated.
    #[test]
    fn the_seed_restores_the_dumped_keys_with_their_values_escaped() {
        let dir = tempfile::tempdir().expect("a temp dir");
        dump(
            dir.path(),
            r#"{"keys":{"shiranami.theme":"\"dark\"","shiranami.app-store":"{\"state\":{\"uiScale\":115}}"}}"#,
        );

        let script = renderer_seed_script(dir.path(), &migrated()).expect("a seed is produced");

        assert!(script.contains(r#"seed("shiranami.theme", "\"dark\"")"#), "{script}");
        assert!(
            script.contains(r#"seed("shiranami.app-store", "{\"state\":{\"uiScale\":115}}")"#),
            "{script}"
        );
    }

    /// The property that lets the script run on every launch instead of once: it
    /// never overwrites a value the user has since changed in v2.
    #[test]
    fn the_seed_only_writes_keys_local_storage_does_not_already_hold() {
        let dir = tempfile::tempdir().expect("a temp dir");
        dump(dir.path(), r#"{"keys":{"shiranami.theme":"\"dark\""}}"#);

        let script = renderer_seed_script(dir.path(), &migrated()).expect("a seed");

        assert!(
            script.contains("getItem(key) === null"),
            "a seed that overwrote would revert a v2 preference on the next start: {script}"
        );
    }

    /// A dump can only reach `localStorage` through the prefix filter, because
    /// this script runs before page code and anything it writes is
    /// indistinguishable from something the app stored itself.
    #[test]
    fn a_tampered_dump_cannot_seed_keys_outside_the_shiranami_namespace() {
        let dir = tempfile::tempdir().expect("a temp dir");
        dump(
            dir.path(),
            r#"{"keys":{"shiranami.theme":"\"dark\"","authToken":"stolen"}}"#,
        );

        let script = renderer_seed_script(dir.path(), &migrated()).expect("a seed");

        assert!(script.contains("shiranami.theme"), "{script}");
        assert!(!script.contains("authToken"), "{script}");
        assert!(!script.contains("stolen"), "{script}");
    }

    /// §3.5's belt-and-braces: a v1 user who never got the bridge release has no
    /// dump at all, and must not be re-onboarded on top of a migration.
    #[test]
    fn a_migration_with_no_dump_still_seeds_the_onboarding_flag() {
        let dir = tempfile::tempdir().expect("a temp dir");

        let script = renderer_seed_script(dir.path(), &migrated()).expect("a seed");

        assert!(script.contains("shiranami.onboarding"), "{script}");
        assert!(script.contains("hasCompletedOnboarding"), "{script}");
    }

    /// …and a genuinely fresh install is not told it has already onboarded.
    #[test]
    fn a_fresh_install_gets_no_seed_at_all() {
        let dir = tempfile::tempdir().expect("a temp dir");

        for outcome in [Outcome::NoLegacyData, Outcome::AlreadyMigrated] {
            assert!(
                renderer_seed_script(dir.path(), &outcome).is_none(),
                "{outcome:?} has no v1 renderer state to restore"
            );
        }
    }

    /// The dump wins over the reconstruction when both could supply the flag —
    /// the real slice carries whatever else the store persisted.
    #[test]
    fn a_dumped_onboarding_slice_is_seeded_before_the_fallback() {
        let dir = tempfile::tempdir().expect("a temp dir");
        dump(
            dir.path(),
            r#"{"keys":{"shiranami.onboarding":"{\"state\":{\"hasCompletedOnboarding\":true},\"version\":9}"}}"#,
        );

        let script = renderer_seed_script(dir.path(), &migrated()).expect("a seed");
        let dumped = script.find(r#""version\":9"#).expect("the dumped slice is present");
        let fallback = script.find(r#"'{"state":{"hasCompletedOnboarding":true},"version":1}'"#);

        if let Some(fallback) = fallback {
            assert!(
                dumped < fallback,
                "the dump has to be seeded first, since `seed` never overwrites"
            );
        }
    }

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
