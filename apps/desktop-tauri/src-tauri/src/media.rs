//! Claiming the OS media surface, and the two platform facts that decide how.
//!
//! §2.7 makes this day-one work rather than a nice-to-have: the webview's media
//! session is suppressed (`crate::window`), so if nothing claims the OS surface
//! there is **no** media-key handling and **no** now-playing entry at all —
//! where v1 at least had `navigator.mediaSession` on macOS.
//!
//! # Why this is not in `boot::services`
//!
//! Everything else in `Deferred` can be built from values. This one needs the
//! **window**, and on Windows it needs the window's raw `HWND` — `souvlaki`'s
//! `MediaControls::new` ends in an `expect` without one. `SouvlakiBackend::new`
//! checks first and returns `MissingWindowHandle` instead, "because a panic in
//! the composition root takes the app down over a media-key feature".
//!
//! The crate's backend trait also carries **no `Send` bound**, deliberately:
//! `SystemMediaTransportControls` belongs to the thread that owns the window
//! handle. That is what picks the lock in `crate::adapters` and what keeps this
//! construction on the setup thread rather than in a spawned task.
//!
//! # souvlaki #77, and what it means for `pnpm tauri:dev`
//!
//! Architecture §2.7 budgets it explicitly: *"#77 (macOS panic in **debug**
//! builds only — release is fine; expect it during development)."* The panic is
//! in `MPRemoteCommandCenter`'s position-scrubbing handler, so it fires when a
//! developer drags the scrubber in macOS Now Playing — not on ordinary
//! play/pause, and never in a shipped build.
//!
//! It is documented rather than worked around because the only workaround is to
//! not register the handler, which would cost the feature in release builds too.
//! [`is_supported`] does not exclude debug macOS for that reason.

use std::sync::Arc;

use shiranami_media_controls::{CommandSink, MediaControlsService};
use tauri::{AppHandle, WebviewWindow};

use crate::adapters::MediaControlsAdapter;
use crate::seam::MediaControls;

/// Whether this build claims the OS media surface.
///
/// Linux is excluded because `shiranami-media-controls` compiles no backend
/// there (§2.1 ships no Linux target), and the harness because §2.8 step 7 says
/// so.
pub const fn is_supported(e2e: bool) -> bool {
    !e2e && cfg!(any(target_os = "windows", target_os = "macos"))
}

/// Build the media-controls seam over the real OS surface.
///
/// Returns `None` when this build has none — the command layer already answers
/// for an absent seam, so there is no second path to keep in agreement.
pub fn build(app: &AppHandle, window: &WebviewWindow, e2e: bool) -> Option<Arc<dyn MediaControls>> {
    if !is_supported(e2e) {
        tracing::debug!(e2e, "this build does not claim the OS media surface");
        return None;
    }

    // The remote's buttons arrive on the OS's own thread, so the seam between
    // them and the renderer is a channel. Every command becomes the same
    // `media:command` event the tray and the media keys send.
    let handle = app.clone();
    let sink = CommandSink::from_fn(move |command| {
        crate::tray::send_command(&handle, command);
    });

    let mut service = build_service(window)?;

    if let Err(error) = service.attach(sink) {
        tracing::warn!(%error, "the OS media surface refused the command handlers");
    }

    Some(Arc::new(MediaControlsAdapter::new(service)))
}

/// The platform-specific half.
#[cfg(any(target_os = "windows", target_os = "macos"))]
fn build_service(
    window: &WebviewWindow,
) -> Option<MediaControlsService<shiranami_media_controls::souvlaki_backend::SouvlakiBackend>> {
    use shiranami_media_controls::souvlaki_backend::{SouvlakiBackend, SouvlakiConfig};

    let config = SouvlakiConfig {
        // Windows only, and souvlaki #67 means it is not honoured there either
        // yet — carried so the value is right when the upstream fix lands.
        window_handle: window_handle(window),
        ..SouvlakiConfig::default()
    };

    match SouvlakiBackend::new(&config) {
        Ok(backend) => Some(MediaControlsService::new(backend)),
        Err(error) => {
            // Never fatal. A machine whose media surface refuses to open still
            // plays music; v1 wrapped `initializeMediaControls` in its own
            // try/catch for the same reason.
            tracing::warn!(%error, "could not claim the OS media surface");
            None
        }
    }
}

/// Linux, where the crate compiles no backend at all.
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn build_service(
    _window: &WebviewWindow,
) -> Option<MediaControlsService<shiranami_media_controls::NullBackend>> {
    None
}

/// The raw `HWND` souvlaki needs on Windows, as the integer the crate asks for.
///
/// `SouvlakiConfig` is deliberately free of Tauri types (§2.1: the composition
/// root depends on the crates, never the reverse), so the handle crosses as a
/// plain `isize`.
#[cfg(target_os = "windows")]
fn window_handle(window: &WebviewWindow) -> Option<isize> {
    match window.hwnd() {
        Ok(hwnd) => Some(hwnd.0 as isize),
        Err(error) => {
            tracing::warn!(%error, "no window handle; the media surface cannot open");
            None
        }
    }
}

/// macOS genuinely has no handle to give; Linux never builds a service that
/// would ask (which is why this is not `cfg(not(windows))` — clippy on the
/// ubuntu job flags that variant as dead code).
#[cfg(target_os = "macos")]
fn window_handle(_window: &WebviewWindow) -> Option<isize> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// §2.8 step 7: the harness claims nothing.
    #[test]
    fn the_harness_claims_no_media_surface() {
        assert!(!is_supported(true));
    }

    /// The two platforms the crate compiles a backend for are the two this
    /// claims on. A mismatch would be a build that tries to open a surface the
    /// crate has no code for.
    #[test]
    fn support_matches_the_platforms_the_crate_ships_a_backend_for() {
        assert_eq!(
            is_supported(false),
            cfg!(any(target_os = "windows", target_os = "macos"))
        );
    }

    /// macOS is **not** excluded in debug builds despite souvlaki #77. The panic
    /// is in the position-scrubbing handler only, and excluding debug macOS
    /// would mean the feature was never exercised during development at all —
    /// which is how a release-only regression ships.
    #[cfg(target_os = "macos")]
    #[test]
    fn a_debug_macos_build_still_claims_the_surface() {
        assert!(is_supported(false));
    }
}
