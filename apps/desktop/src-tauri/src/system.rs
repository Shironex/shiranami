//! Close to tray, minimize to tray, the quit flag that beats both, and launch
//! at startup.
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
//!
//! # Launch at startup
//!
//! `shiranami_media_controls::autostart` owns v1's rule (a fresh install never
//! writes the login item) and this module supplies the OS write through
//! `tauri-plugin-autostart`, called from Rust only: `capabilities/default.json`
//! grants the webview none of the plugin's commands, because the settings
//! store is already the one way the renderer asks for this. The value is
//! reconciled at boot and followed on the bus, like the two tray settings.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use shiranami_core::store::{RendererStoreKey, SettingsStore};
use shiranami_core::sync::lock_or_recover;
use shiranami_media_controls::autostart::{Autostart, AutostartBackend, AutostartOutcome};
use shiranami_media_controls::system::{CloseAction, MinimizeAction, SystemBehavior};
use shiranami_media_controls::{MediaControlsError, Result as MediaResult};
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
        match key {
            RendererStoreKey::SystemCloseToTray => &self.close_to_tray,
            RendererStoreKey::SystemMinimizeToTray => &self.minimize_to_tray,
            // `watch` subscribes these two keys and no others, so a third one
            // here is a new subscription that needs its own flag.
            other => unreachable!("{other:?} is not a tray preference"),
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

/// What a close request should do.
///
/// A plain close before boot managed the state (a window closed during a
/// failed boot must still close), and a plain close when there is no tray:
/// the tray is the only way back to a hidden window on Windows, so hiding with
/// no tray (a desktop that refused one, or the harness) would strand the app
/// running and unreachable.
pub fn close_action(app: &AppHandle) -> CloseAction {
    close_decision(
        app.try_state::<SystemState>().as_deref(),
        app.try_state::<crate::tray::Tray>().is_some(),
    )
}

/// What a minimize should do, with the same fallbacks as [`close_action`].
pub fn minimize_action(app: &AppHandle) -> MinimizeAction {
    minimize_decision(
        app.try_state::<SystemState>().as_deref(),
        app.try_state::<crate::tray::Tray>().is_some(),
    )
}

fn close_decision(state: Option<&SystemState>, has_tray: bool) -> CloseAction {
    match state {
        Some(state) if has_tray => state.on_close(),
        _ => CloseAction::Close,
    }
}

fn minimize_decision(state: Option<&SystemState>, has_tray: bool) -> MinimizeAction {
    match state {
        Some(state) if has_tray => state.on_minimize(),
        _ => MinimizeAction::Minimize,
    }
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

/// Whether this build registers a login item at all.
///
/// Not in a development build, where the login item would point at a target
/// directory that moves (v1 documented the same for its unpackaged builds),
/// and not under the harness, which must never leave OS state behind. Linux
/// is excluded by the crate's own `autostart::is_supported`.
pub fn autostart_enabled(e2e: bool) -> bool {
    !e2e && !crate::infra::platform::is_dev()
}

/// `tauri-plugin-autostart`'s manager as the crate's backend.
pub struct PluginAutostart {
    app: AppHandle,
}

impl AutostartBackend for PluginAutostart {
    fn set_enabled(&self, enabled: bool) -> MediaResult<()> {
        // `try_state` rather than the plugin's `autolaunch()`, which panics
        // when the plugin is not registered.
        let Some(manager) = self
            .app
            .try_state::<tauri_plugin_autostart::AutoLaunchManager>()
        else {
            return Err(MediaControlsError::Backend(
                "the autostart plugin is not registered".to_owned(),
            ));
        };

        let result = if enabled {
            manager.enable()
        } else {
            manager.disable()
        };
        // Whichever way the switch went, and whether or not the plugin's own
        // write succeeded, v1's entry must not survive it. The plugin's
        // `disable` fails with not-found when its own value is absent, which
        // is the usual state for a v1 user turning the switch off.
        remove_v1_login_items();
        result.map_err(|error| MediaControlsError::Backend(error.to_string()))
    }
}

/// The `Run` value names v1 may have written on Windows.
///
/// v1 called Electron's `app.setLoginItemSettings({ openAtLogin })` and never
/// `setAppUserModelId`, so the value was named after Electron's default
/// AppUserModelId, `electron.app.<app name>`. The app name is the packaged
/// `package.json`'s `productName`, or its `name` when there is none, and the
/// repo alone cannot say which the shipped build had, so both are cleared. The
/// plugin's own value is `Shiranami`, which neither of these can collide with.
const V1_RUN_VALUE_NAMES: [&str; 2] = ["electron.app.Shiranami", "electron.app.@shiranami/desktop"];

/// Delete v1's Windows login item, if one is still there.
///
/// A migrated v1 user who turns the switch off would otherwise keep launching
/// at login from v1's entry, which the v2 installer's uninstall of v1 does not
/// touch (Electron wrote it at runtime, not the installer). Windows only: on
/// macOS, v1's entry is an `SMAppService` login item that cannot be removed
/// without new native code, and is a one-time manual cleanup instead.
///
/// Compiled everywhere so the call is type-checked on every platform, and only
/// acted on where it means something.
fn remove_v1_login_items() {
    if !cfg!(windows) {
        return;
    }

    for name in V1_RUN_VALUE_NAMES {
        // The path is never read: `disable` only deletes the value by name.
        let entry = match auto_launch::AutoLaunchBuilder::new()
            .set_app_name(name)
            .set_app_path("unused")
            .build()
        {
            Ok(entry) => entry,
            Err(error) => {
                tracing::debug!(%error, name, "could not address v1's login item");
                continue;
            }
        };

        match entry.disable() {
            Ok(()) => tracing::info!(name, "removed v1's login item"),
            Err(auto_launch::Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => tracing::warn!(%error, name, "could not remove v1's login item"),
        }
    }
}

/// Apply `system.launchAtStartup` now, and on every change.
///
/// The boot write repeats v1's: re-registering an already registered item is
/// harmless and keeps it pointing at wherever the app lives today. It runs on
/// a blocking worker because it is a file write on macOS and a registry write
/// on Windows, and neither belongs on the thread that paints the first frame.
pub fn watch_autostart(app: &AppHandle, settings: &Arc<SettingsStore>) {
    let writer = AutostartWriter::new(PluginAutostart { app: app.clone() }, settings);
    writer.follow_changes();

    tauri::async_runtime::spawn_blocking(move || writer.reconcile());
}

/// Every login-item write, one at a time.
///
/// The boot write runs on a worker and a toggle arrives on the settings bus,
/// so the two can overlap. A boot write that read the value before the toggle
/// and wrote it after would put the old setting back. So every write takes the
/// same lock, and the boot write reads the stored value only once it holds it:
/// whichever runs last writes the latest value.
struct AutostartWriter<B> {
    autostart: Mutex<Autostart<B>>,
    settings: Arc<SettingsStore>,
}

impl<B: AutostartBackend + Send + 'static> AutostartWriter<B> {
    fn new(backend: B, settings: &Arc<SettingsStore>) -> Arc<Self> {
        Arc::new(Self {
            autostart: Mutex::new(Autostart::new(backend)),
            settings: Arc::clone(settings),
        })
    }

    /// Apply the value stored right now, as the boot write.
    fn reconcile(&self) {
        let autostart = lock_or_recover(&self.autostart);
        let stored = self.settings.get(RendererStoreKey::SystemLaunchAtStartup);
        report(autostart.apply_persisted(stored.as_ref()));
    }

    /// Apply every later change from the settings bus.
    fn follow_changes(self: &Arc<Self>) {
        let writer = Arc::clone(self);
        self.settings.bus().subscribe(
            RendererStoreKey::SystemLaunchAtStartup.path(),
            move |event| report(lock_or_recover(&writer.autostart).apply_change(event)),
        );
    }
}

/// v1 logged a refused login-item write and carried on.
fn report(outcome: MediaResult<AutostartOutcome>) {
    match outcome {
        Ok(outcome) => tracing::debug!(?outcome, "launch at startup reconciled"),
        Err(error) => tracing::warn!(%error, "could not write the login item"),
    }
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

    /// No tray, no hiding: the tray is the way back to a hidden window, so a
    /// desktop without one keeps the ordinary close and minimize even with
    /// both switches on.
    #[test]
    fn without_a_tray_nothing_is_hidden() {
        let (_dir, settings) = store();
        settings
            .set(RendererStoreKey::SystemCloseToTray, Value::Bool(true))
            .expect("write");
        settings
            .set(RendererStoreKey::SystemMinimizeToTray, Value::Bool(true))
            .expect("write");
        let state = SystemState::new(SystemPrefs::watch(&settings));

        assert_eq!(close_decision(Some(&state), false), CloseAction::Close);
        assert_eq!(
            minimize_decision(Some(&state), false),
            MinimizeAction::Minimize
        );
        assert_eq!(close_decision(Some(&state), true), CloseAction::HideToTray);
        assert_eq!(
            minimize_decision(Some(&state), true),
            MinimizeAction::HideToTray
        );
        assert_eq!(close_decision(None, true), CloseAction::Close);
    }

    /// Records every login-item write.
    #[derive(Clone, Default)]
    struct RecordingLoginItem {
        writes: Arc<Mutex<Vec<bool>>>,
    }

    impl AutostartBackend for RecordingLoginItem {
        fn set_enabled(&self, enabled: bool) -> MediaResult<()> {
            lock_or_recover(&self.writes).push(enabled);
            Ok(())
        }
    }

    /// A toggle that lands before the boot write gets to run must not be
    /// overwritten by the value the boot saw at launch.
    #[test]
    fn a_late_boot_write_writes_the_latest_value() {
        if !shiranami_media_controls::autostart::is_supported() {
            return;
        }
        let dir = tempfile::tempdir().expect("a temp dir");
        let (settings, _) = SettingsStore::load(dir.path().join("config.json"));
        let settings = Arc::new(settings);
        settings
            .set(RendererStoreKey::SystemLaunchAtStartup, Value::Bool(true))
            .expect("write");

        let backend = RecordingLoginItem::default();
        let writer = AutostartWriter::new(backend.clone(), &settings);
        writer.follow_changes();

        // The user turns it off before the boot worker has run.
        settings
            .set(RendererStoreKey::SystemLaunchAtStartup, Value::Bool(false))
            .expect("write");
        writer.reconcile();

        assert_eq!(
            lock_or_recover(&backend.writes).last(),
            Some(&false),
            "the boot write reads the stored value when it runs"
        );
    }

    /// v1's entries are never ours to confuse with the plugin's.
    #[test]
    fn the_v1_value_names_are_not_the_plugins() {
        for name in V1_RUN_VALUE_NAMES {
            assert!(name.starts_with("electron.app."), "{name}");
            assert_ne!(name, "Shiranami");
        }
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
