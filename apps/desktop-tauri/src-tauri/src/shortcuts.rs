//! Global media-key shortcuts, on the platforms v1 registered them.
//!
//! # Four accelerators, and not on macOS
//!
//! v1 registered `MediaPlayPause`, `MediaNextTrack`, `MediaPreviousTrack` and
//! `MediaStop` behind one condition: `process.platform !== 'darwin'`. macOS was
//! deliberately excluded because its media keys were served by
//! `navigator.mediaSession`, which Safari bridges to
//! `MPNowPlayingInfoCenter`.
//!
//! That reason is **gone in v2** — §2.7's opening finding is that an embedded
//! WKWebView does not bridge mediaSession, which is why souvlaki exists at all,
//! and `crate::window` now suppresses the media session outright. So the
//! platform split survives for a different reason than the one that created it:
//! on macOS, souvlaki's `MPRemoteCommandCenter` handlers *are* the media-key
//! path, and registering a global shortcut on top would give the same keypress
//! two claimants.
//!
//! §2.7 states the policy directly: *"No `tauri-plugin-global-shortcut`
//! registration for media keys (souvlaki's SMTC/MPRemoteCommandCenter buttons
//! cover them); the plugin stays available only as a settings-gated escape hatch
//! if Windows key delivery proves flaky."*
//!
//! This module is that escape hatch, kept at v1 parity: non-macOS only, and off
//! under the E2E harness, which v1 also gated in the same block as the tray.
//!
//! # Every failure is individual and none is fatal
//!
//! v1 wrapped each `globalShortcut.register` in its own try/catch and logged a
//! failure per key, because another app may already hold one of them — Spotify
//! commonly holds `MediaPlayPause`. Losing one key must not cost the other
//! three, and losing all four must not fail a launch.

use shiranami_media_controls::MediaCommand;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt as _, Shortcut, ShortcutState};

/// v1's four accelerators and what each means.
///
/// The names are Tauri's spelling of the same keys; v1's Electron accelerators
/// were `MediaPlayPause`, `MediaNextTrack`, `MediaPreviousTrack`, `MediaStop`.
pub const MEDIA_KEYS: [(&str, MediaCommand); 4] = [
    ("MediaPlayPause", MediaCommand::TogglePlay),
    ("MediaTrackNext", MediaCommand::Next),
    ("MediaTrackPrevious", MediaCommand::Previous),
    ("MediaStop", MediaCommand::Stop),
];

/// Whether this run registers global media keys.
///
/// See the module docs: not on macOS (souvlaki owns the keys there), and not
/// under the harness.
pub const fn is_enabled(e2e: bool) -> bool {
    !e2e && !cfg!(target_os = "macos")
}

/// Register the four accelerators, logging whatever the OS refuses.
pub fn register(app: &AppHandle, e2e: bool) {
    if !is_enabled(e2e) {
        tracing::debug!(
            e2e,
            macos = cfg!(target_os = "macos"),
            "global media keys are not registered on this run"
        );
        return;
    }

    for (accelerator, command) in MEDIA_KEYS {
        let shortcut: Shortcut = match accelerator.parse() {
            Ok(shortcut) => shortcut,
            Err(error) => {
                tracing::warn!(%error, accelerator, "unparsable media accelerator");
                continue;
            }
        };

        let handle = app.clone();
        // `MediaCommand` is `Clone` and not `Copy` — it has an object form for
        // the seek commands v1 never had — and the callback is an `Fn`, so the
        // value has to be cloned per invocation rather than moved out.
        let registered =
            app.global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, event| {
                    // Press only. Without this the key fires twice per tap — once
                    // down, once up — which for `toggle-play` means no visible
                    // change at all, the hardest possible symptom to diagnose.
                    if event.state() == ShortcutState::Pressed {
                        crate::tray::send_command(&handle, command.clone());
                    }
                });

        match registered {
            // v1 logged this per key, because another app holding one of them
            // (Spotify commonly holds play/pause) must not cost the other three.
            Err(error) => tracing::warn!(%error, accelerator, "could not register a media key"),
            Ok(()) => tracing::debug!(accelerator, "registered a media key"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// v1's four keys, and their meanings. A fifth would be a new behaviour and
    /// a missing one is a key that silently stops working.
    #[test]
    fn the_four_accelerators_are_v1s() {
        assert_eq!(MEDIA_KEYS.len(), 4);

        let commands: Vec<MediaCommand> = MEDIA_KEYS
            .iter()
            .map(|(_, command)| command.clone())
            .collect();
        assert_eq!(
            commands,
            vec![
                MediaCommand::TogglePlay,
                MediaCommand::Next,
                MediaCommand::Previous,
                MediaCommand::Stop,
            ]
        );
    }

    /// Every accelerator parses. A typo would be a key that never fires and
    /// logs a warning nobody reads, so it is worth catching at `cargo test`.
    #[test]
    fn every_accelerator_parses() {
        for (accelerator, _) in MEDIA_KEYS {
            assert!(
                accelerator.parse::<Shortcut>().is_ok(),
                "{accelerator} does not parse"
            );
        }
    }

    /// Each one reaches the renderer, or its registration would be decorative.
    #[test]
    fn every_media_key_has_a_renderer_payload() {
        for (accelerator, command) in MEDIA_KEYS {
            assert!(
                crate::commands::media::remote_command_payload(&command).is_some(),
                "{accelerator} maps to a command the renderer cannot receive"
            );
        }
    }

    /// The harness gets none, matching the block v1 gated the tray and the
    /// updater in.
    #[test]
    fn the_harness_registers_nothing() {
        assert!(!is_enabled(true));
    }

    /// macOS is excluded — but for souvlaki's sake now, not mediaSession's.
    #[test]
    fn macos_leaves_the_keys_to_souvlaki() {
        assert_eq!(is_enabled(false), !cfg!(target_os = "macos"));
    }
}
