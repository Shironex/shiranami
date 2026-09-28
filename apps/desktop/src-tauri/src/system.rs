//! Close to tray, minimize to tray, and the quit flag that beats both.
//!
//! `shiranami_media_controls::system` owns the decisions and says what it left
//! to the shell: reading the two settings and performing the answer on a real
//! window. This module is that half, and it is kept small on purpose so every
//! branch with a consequence stays in the crate's tested functions.
//!
//! # The settings are cached, and the cache is the bus's
//!
//! v1 read `store.get('system.closeToTray')` inside its `close` handler. The
//! same read here would take the settings store's lock on the **main thread**,
//! and that lock is held across the file write in `SettingsStore::mutate`: a
//! settings save on a slow disk would stall a click on the close button. So
//! [`SystemPrefs`] reads both keys once at boot and then follows the
//! `ChangeBus`, the way `crate::infra::sentry::watch_consent` follows consent.
//! Toggling either switch still takes effect immediately, which was the point
//! of v1 reading them late.
//!
//! # Every real quit goes through here
//!
//! The quit flag only works if it is set before anything asks the window to
//! close. [`quit`] and [`restart`] set it and then exit, and the tray's Quit
//! item and the updater's install both call them. `RunEvent::ExitRequested`
//! and `RunEvent::Exit` set it too, from `crate::run`, which covers Cmd+Q on
//! macOS: that arrives as `applicationWillTerminate`, reaches Tauri as
//! `RunEvent::Exit` only, and never produces a `CloseRequested` at all. A source
//! scan in the tests below pins that nothing else in the crate calls
//! `AppHandle::exit` or `AppHandle::restart` directly.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use shiranami_core::store::{RendererStoreKey, SettingsStore};
use shiranami_media_controls::system::{CloseAction, MinimizeAction, SystemBehavior};
use tauri::{AppHandle, Manager as _};

/// The live values of `system.closeToTray` and `system.minimizeToTray`.
///
/// Absent or non-boolean reads as off, v1's `=== true`, which is also what the
/// settings page shows for a key it has never written.
#[derive(Debug, Default)]
pub struct SystemPrefs {
    close_to_tray: AtomicBool,
    minimize_to_tray: AtomicBool,
}

impl SystemPrefs {
    /// Read both keys now, and keep them current from the settings bus.
    pub fn watch(settings: &SettingsStore) -> Arc<Self> {
        let prefs = Arc::new(Self {
            close_to_tray: AtomicBool::new(is_on(settings, RendererStoreKey::SystemCloseToTray)),
            minimize_to_tray: AtomicBool::new(is_on(
                settings,
                RendererStoreKey::SystemMinimizeToTray,
            )),
        });

        for key in [
            RendererStoreKey::SystemCloseToTray,
            RendererStoreKey::SystemMinimizeToTray,
        ] {
            let prefs = Arc::clone(&prefs);
            settings.bus().subscribe(key.path(), move |event| {
                prefs.flag(key).store(event.is_enabled(), Ordering::SeqCst);
            });
        }

        prefs
    }

    /// Whether closing the window should hide it instead.
    pub fn close_to_tray(&self) -> bool {
        self.close_to_tray.load(Ordering::SeqCst)
    }

    /// Whether minimizing the window should hide it instead.
    pub fn minimize_to_tray(&self) -> bool {
        self.minimize_to_tray.load(Ordering::SeqCst)
    }

    fn flag(&self, key: RendererStoreKey) -> &AtomicBool {
        if key == RendererStoreKey::SystemCloseToTray {
            &self.close_to_tray
        } else {
            &self.minimize_to_tray
        }
    }
}

fn is_on(settings: &SettingsStore, key: RendererStoreKey) -> bool {
    settings.get(key) == Some(serde_json::Value::Bool(true))
}

/// The managed pair: the crate's quit flag and the settings it decides from.
///
/// Managed from `crate::run` before the builder starts, so it exists before
/// the first window event can fire and before a tray item can be clicked.
pub struct SystemState {
    behavior: SystemBehavior,
    prefs: Arc<SystemPrefs>,
}

impl SystemState {
    /// A running app with these settings.
    pub fn new(prefs: Arc<SystemPrefs>) -> Self {
        Self {
            behavior: SystemBehavior::new(),
            prefs,
        }
    }

    /// What a close request should do right now.
    pub fn on_close(&self) -> CloseAction {
        self.behavior.on_close(self.prefs.close_to_tray())
    }

    /// What a minimize should do right now.
    pub fn on_minimize(&self) -> MinimizeAction {
        self.behavior.on_minimize(self.prefs.minimize_to_tray())
    }

    /// Record that the app is on its way out.
    pub fn begin_quit(&self) {
        self.behavior.begin_quit();
    }

    /// Whether the app is on its way out.
    pub fn is_quitting(&self) -> bool {
        self.behavior.is_quitting()
    }
}

/// What a close request should do, or a plain close before boot managed the
/// state (a window closed during a failed boot must still close).
pub fn close_action(app: &AppHandle) -> CloseAction {
    app.try_state::<SystemState>()
        .map_or(CloseAction::Close, |state| state.on_close())
}

/// What a minimize should do, with the same fallback as [`close_action`].
pub fn minimize_action(app: &AppHandle) -> MinimizeAction {
    app.try_state::<SystemState>()
        .map_or(MinimizeAction::Minimize, |state| state.on_minimize())
}

/// Set the quit flag. Idempotent, and safe before the state is managed.
pub fn begin_quit(app: &AppHandle) {
    if let Some(state) = app.try_state::<SystemState>() {
        state.begin_quit();
    }
}

/// Quit the app for real. v1's `app.quit()`, which fired `before-quit` first.
pub fn quit(app: &AppHandle) {
    quit_with(app.try_state::<SystemState>().as_deref(), || app.exit(0));
}

/// Restart into a freshly installed update.
///
/// The updater used to call `AppHandle::restart` directly. On Windows the
/// installer exits the process before that line, but on macOS the restart is
/// ours, and without the flag a close-to-tray user would have the restart
/// swallowed by their own setting.
pub fn restart(app: &AppHandle) -> ! {
    if let Some(state) = app.try_state::<SystemState>() {
        state.begin_quit();
    }
    app.restart()
}

/// [`quit`]'s ordering, with the exit supplied, so a test can observe that the
/// flag is already set by the time the exit runs.
fn quit_with(state: Option<&SystemState>, exit: impl FnOnce()) {
    if let Some(state) = state {
        state.begin_quit();
    }
    exit();
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use serde_json::Value;

    use super::*;

    fn store() -> (tempfile::TempDir, SettingsStore) {
        let dir = tempfile::tempdir().expect("a temp dir");
        let (store, _) = SettingsStore::load(dir.path().join("config.json"));
        (dir, store)
    }

    #[test]
    fn a_fresh_install_hides_nothing() {
        let (_dir, settings) = store();
        let prefs = SystemPrefs::watch(&settings);

        assert!(!prefs.close_to_tray());
        assert!(!prefs.minimize_to_tray());
    }

    /// The boot read: a value saved last session applies from the first close.
    #[test]
    fn the_stored_values_are_read_at_boot() {
        let (_dir, settings) = store();
        settings
            .set(RendererStoreKey::SystemCloseToTray, Value::Bool(true))
            .expect("write");

        let prefs = SystemPrefs::watch(&settings);

        assert!(prefs.close_to_tray());
        assert!(!prefs.minimize_to_tray(), "the two keys are independent");
    }

    /// The live read: toggling the switch applies to the very next close,
    /// which is why v1 read the key inside its handler.
    #[test]
    fn a_toggle_applies_without_a_restart() {
        let (_dir, settings) = store();
        let prefs = SystemPrefs::watch(&settings);

        settings
            .set(RendererStoreKey::SystemMinimizeToTray, Value::Bool(true))
            .expect("write");
        assert!(prefs.minimize_to_tray());
        assert!(!prefs.close_to_tray());

        settings
            .set(RendererStoreKey::SystemCloseToTray, Value::Bool(true))
            .expect("write");
        settings
            .set(RendererStoreKey::SystemMinimizeToTray, Value::Bool(false))
            .expect("write");
        assert!(prefs.close_to_tray());
        assert!(!prefs.minimize_to_tray());
    }

    /// `=== true`: a hand-edited string is not a yes.
    #[test]
    fn a_non_boolean_value_reads_as_off() {
        let (_dir, settings) = store();
        settings
            .set(
                RendererStoreKey::SystemCloseToTray,
                Value::String("true".to_owned()),
            )
            .expect("write");

        assert!(!SystemPrefs::watch(&settings).close_to_tray());
    }

    #[test]
    fn the_state_decides_from_the_live_settings() {
        let (_dir, settings) = store();
        let state = SystemState::new(SystemPrefs::watch(&settings));

        assert_eq!(state.on_close(), CloseAction::Close);
        assert_eq!(state.on_minimize(), MinimizeAction::Minimize);

        settings
            .set(RendererStoreKey::SystemCloseToTray, Value::Bool(true))
            .expect("write");
        settings
            .set(RendererStoreKey::SystemMinimizeToTray, Value::Bool(true))
            .expect("write");

        assert_eq!(state.on_close(), CloseAction::HideToTray);
        assert_eq!(state.on_minimize(), MinimizeAction::HideToTray);
    }

    /// The flag is set **before** the exit runs. Reversing the two lines in
    /// [`quit_with`] would let the exit's own close request be trapped by
    /// close-to-tray, which is the bug v1's `before-quit` existed to prevent.
    #[test]
    fn a_quit_sets_the_flag_before_it_exits() {
        let (_dir, settings) = store();
        settings
            .set(RendererStoreKey::SystemCloseToTray, Value::Bool(true))
            .expect("write");
        let state = SystemState::new(SystemPrefs::watch(&settings));

        let mut seen = None;
        quit_with(Some(&state), || seen = Some(state.on_close()));

        assert_eq!(
            seen,
            Some(CloseAction::Close),
            "a close during the quit must not be turned into a hide"
        );
        assert!(state.is_quitting());
    }

    /// A quit before boot managed the state still exits.
    #[test]
    fn a_quit_without_state_still_exits() {
        let mut exited = false;
        quit_with(None, || exited = true);
        assert!(exited);
    }

    fn sources() -> Vec<(PathBuf, String)> {
        fn collect(dir: &Path, found: &mut Vec<(PathBuf, String)>) {
            for entry in std::fs::read_dir(dir).expect("read the source dir") {
                let path = entry.expect("a dir entry").path();
                if path.is_dir() {
                    collect(&path, found);
                } else if path.extension().is_some_and(|ext| ext == "rs") {
                    let source = std::fs::read_to_string(&path).expect("read a source file");
                    found.push((path, source));
                }
            }
        }

        let mut found = Vec::new();
        collect(
            Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/src")),
            &mut found,
        );
        found
    }

    /// Every real quit sets the flag first, which only holds while nothing
    /// outside this module exits or restarts the app by hand. The patterns are
    /// assembled so this file does not match itself in a literal.
    #[test]
    fn only_this_module_exits_or_restarts_the_app() {
        let patterns = [concat!(".exit", "("), concat!(".restart", "(")];
        let offenders: Vec<String> = sources()
            .into_iter()
            .filter(|(path, _)| !path.ends_with("system.rs"))
            .filter(|(_, source)| patterns.iter().any(|pattern| source.contains(pattern)))
            .map(|(path, _)| path.display().to_string())
            .collect();

        assert!(
            offenders.is_empty(),
            "call crate::system::quit or ::restart instead, so the quit flag is set first: {offenders:?}"
        );
    }
}
