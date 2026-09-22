//! Minimize-to-tray, close-to-tray, and the flag that must override both.
//!
//! Ported from `apps/desktop/src/main/app/system-behavior.ts`. Two window
//! events, two settings, and one piece of state — and the state is the part
//! worth having a type for.
//!
//! # The quit flag
//!
//! v1 set `isQuitting = true` on Electron's `before-quit` and checked it first
//! in the `close` handler. Without it, `closeToTray` traps *every* close,
//! including the ones the user explicitly asked for: Cmd+Q, the tray's own Quit
//! item, and — the one that matters most — the updater's quit-and-install. An
//! app that cannot be quit is a support ticket; an app that cannot install an
//! update is a security problem.
//!
//! # Reading the settings late
//!
//! v1 called `store.get('system.closeToTray')` inside the handler rather than
//! capturing it when the listener was attached, so toggling the setting took
//! effect immediately instead of at the next launch. The methods here take the
//! current value as an argument for the same reason: there is nowhere to cache
//! it, so it cannot go stale.

use std::sync::atomic::{AtomicBool, Ordering};

/// What to do about a window close request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseAction {
    /// Cancel the close and hide the window. v1's
    /// `event.preventDefault(); win.hide();`.
    HideToTray,
    /// Let the close happen.
    Close,
}

/// What to do about a window minimize.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MinimizeAction {
    /// Hide the window instead, so only the tray icon remains.
    HideToTray,
    /// Let it minimize normally.
    Minimize,
}

/// Whether the app is on its way out.
///
/// Atomic because the quit signal and the window events do not necessarily
/// arrive on the same thread, and because a shared `&self` is what lets the
/// shell hand this to two independent event handlers.
#[derive(Debug, Default)]
pub struct SystemBehavior {
    quitting: AtomicBool,
}

impl SystemBehavior {
    /// A running app.
    pub fn new() -> Self {
        Self::default()
    }

    /// Record that the app is quitting. v1's `before-quit` handler.
    pub fn begin_quit(&self) {
        self.quitting.store(true, Ordering::SeqCst);
    }

    /// Whether [`Self::begin_quit`] has been called.
    pub fn is_quitting(&self) -> bool {
        self.quitting.load(Ordering::SeqCst)
    }

    /// Decide a close, given the live `system.closeToTray` value.
    pub fn on_close(&self, close_to_tray: bool) -> CloseAction {
        if self.is_quitting() || !close_to_tray {
            return CloseAction::Close;
        }

        CloseAction::HideToTray
    }

    /// Decide a minimize, given the live `system.minimizeToTray` value.
    ///
    /// No quit check: v1 had none either, because a minimize during shutdown is
    /// not something a user can ask for and hiding an already-closing window
    /// changes nothing.
    pub fn on_minimize(&self, minimize_to_tray: bool) -> MinimizeAction {
        if minimize_to_tray {
            MinimizeAction::HideToTray
        } else {
            MinimizeAction::Minimize
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fresh_app_is_not_quitting() {
        assert!(!SystemBehavior::new().is_quitting());
    }

    #[test]
    fn closing_with_the_setting_off_closes() {
        assert_eq!(SystemBehavior::new().on_close(false), CloseAction::Close);
    }

    #[test]
    fn closing_with_the_setting_on_hides() {
        assert_eq!(
            SystemBehavior::new().on_close(true),
            CloseAction::HideToTray
        );
    }

    /// The whole reason the flag exists: Cmd+Q, the tray's Quit item and
    /// quit-and-install all reach the same close handler.
    #[test]
    fn a_quit_beats_close_to_tray() {
        let behavior = SystemBehavior::new();
        behavior.begin_quit();

        assert_eq!(
            behavior.on_close(true),
            CloseAction::Close,
            "an app that traps its own quit cannot be updated or exited"
        );
    }

    #[test]
    fn minimizing_follows_its_own_setting() {
        let behavior = SystemBehavior::new();

        assert_eq!(behavior.on_minimize(false), MinimizeAction::Minimize);
        assert_eq!(behavior.on_minimize(true), MinimizeAction::HideToTray);
    }

    /// v1 checked `isQuitting` in `close` only.
    #[test]
    fn a_quit_does_not_change_what_minimizing_does() {
        let behavior = SystemBehavior::new();
        behavior.begin_quit();

        assert_eq!(behavior.on_minimize(true), MinimizeAction::HideToTray);
    }

    #[test]
    fn the_quit_flag_stays_set() {
        let behavior = SystemBehavior::new();
        behavior.begin_quit();
        behavior.begin_quit();

        assert!(behavior.is_quitting());
    }

    /// The two settings are independent: v1 stored and read them separately.
    #[test]
    fn the_two_settings_do_not_affect_each_other() {
        let behavior = SystemBehavior::new();

        assert_eq!(behavior.on_close(true), CloseAction::HideToTray);
        assert_eq!(behavior.on_minimize(false), MinimizeAction::Minimize);
        assert_eq!(behavior.on_close(false), CloseAction::Close);
        assert_eq!(behavior.on_minimize(true), MinimizeAction::HideToTray);
    }
}
