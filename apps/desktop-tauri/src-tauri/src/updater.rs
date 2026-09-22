//! `tauri-plugin-updater` behind `crate::seam::Updater`.
//!
//! Phase 14 froze the shape — three commands, six events, v1's byte-identical
//! payloads — and said what was left:
//!
//! > Phase 16 writes one implementation of that trait and the update UI starts
//! > working with no renderer diff and no change to these files.
//!
//! This is that implementation. Nothing in `commands/updater` changes.
//!
//! # The three disabled cases are v1's, and they are not the same "dev"
//!
//! v1 refused in three places and only one of them was about the build being a
//! debug build:
//!
//! | Case  | v1                                          | Here                  |
//! | ----- | ------------------------------------------- | --------------------- |
//! | dev   | `!app.isPackaged`                           | `debug_assertions`    |
//! | macOS | unsigned, so no updater exists at all (§4.3) | `cfg!(target_os)`     |
//! | E2E   | `initializeAutoUpdater` never called        | `SHIRANAMI_E2E=1`     |
//!
//! All three answer `{ enabled: false }` rather than erroring, because that is
//! what the settings pane renders "updates are not available in this build"
//! from. [`build`] returns `None` for all three and the command layer's absent-seam
//! path produces exactly that answer, so there is no second code path to keep in
//! agreement.
//!
//! macOS stays disabled until the Developer ID certificate lands (§4.3): v1 has
//! no macOS updater to hand over *from*, so there is no regression, and an
//! unsigned app writing into `/Applications` and relaunching is the fragile,
//! Gatekeeper-quarantined path that fails silently on user machines.
//!
//! # `is_release_pending` had to grow, and why that is a launch issue
//!
//! v1's predicate matches `electron-updater`'s wording — `Cannot find
//! latest.yml`, or a message carrying both `.yml` and `404`. v2 publishes no
//! `latest.yml` at all: `tauri-plugin-updater` fetches a `latest.json` endpoint
//! and reports something entirely different when it 404s.
//!
//! The consequence is not cosmetic. During every release window — tag pushed,
//! artifacts still building — the hourly check fails, and without a matching
//! predicate the renderer shows a real error toast instead of the silent return
//! to `idle` the `RELEASE_PENDING` sentinel produces. [`is_release_pending`] is
//! extended with the plugin's wording here, in `crate::commands::updater`'s
//! own function, so both vocabularies live in one predicate with one set of
//! vectors.

use std::sync::Arc;

use async_trait::async_trait;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt as _;

use crate::commands::updater::{
    AppUpdaterEvents, UpdateDownloadProgress, UpdateInfo, UpdaterCheck, UpdaterEvent,
    UpdaterEventSink, UpdaterFailure,
};
use crate::seam::Updater;

/// How long after launch the first check runs. v1's five seconds.
pub const FIRST_CHECK_DELAY_SECS: u64 = 5;

/// How often thereafter. v1's hour.
pub const CHECK_INTERVAL_SECS: u64 = 60 * 60;

/// Whether this build has an updater at all.
///
/// See the module docs for why the three clauses are not one.
pub fn is_supported(e2e: bool) -> bool {
    !e2e && !crate::infra::platform::is_dev() && !cfg!(target_os = "macos")
}

/// The updater for this build, or `None` when it has none.
pub fn build(app: &AppHandle, e2e: bool) -> Option<Arc<dyn Updater>> {
    if !is_supported(e2e) {
        tracing::info!(
            e2e,
            dev = crate::infra::platform::is_dev(),
            macos = cfg!(target_os = "macos"),
            "this build has no auto-updater"
        );
        return None;
    }

    Some(Arc::new(PluginUpdater {
        app: app.clone(),
        events: Arc::new(AppUpdaterEvents::new(app.clone())),
        pending: std::sync::Mutex::new(None),
        downloaded: std::sync::Mutex::new(None),
    }))
}

/// `crate::seam::Updater` over `tauri-plugin-updater`.
struct PluginUpdater {
    app: AppHandle,
    events: Arc<AppUpdaterEvents>,
    /// The update a check found, kept so `download` and `install` act on the
    /// same one.
    ///
    /// v1 did not need this: `electron-updater` is stateful and
    /// `downloadUpdate()` acts on whatever the last check found. The Tauri
    /// plugin hands the check's result back as a value instead, so the
    /// composition root is what remembers it — and it has to, because the three
    /// channels are three separate invokes with a user's decision in between.
    pending: std::sync::Mutex<Option<tauri_plugin_updater::Update>>,

    /// The downloaded installer, held between `download` and `install`.
    ///
    /// The plugin's two-step API hands the bytes back rather than staging them
    /// on disk, and v1's two channels are two invokes with a user pressing
    /// "restart now" in between — so something has to hold them. This is the
    /// composition root's job for the same reason `pending` is.
    downloaded: std::sync::Mutex<Option<(tauri_plugin_updater::Update, Vec<u8>)>>,
}

/// v1's `UpdateInfo`, from the plugin's `Update`.
///
/// `release_date` is a required `String` on the wire because electron-updater
/// always carried one; the Tauri plugin's `date` is optional, so an absent one
/// becomes empty rather than `null`. The renderer reads only `.version` — a
/// grep of `apps/web/src` finds nothing else on this type — so the difference is
/// not observable, but dropping the key would have been a wire change.
fn describe(update: &tauri_plugin_updater::Update) -> UpdateInfo {
    UpdateInfo {
        version: update.version.clone(),
        release_notes: update.body.clone(),
        release_date: update.date.map(|date| date.to_string()).unwrap_or_default(),
    }
}

impl PluginUpdater {
    fn remember(&self, update: Option<tauri_plugin_updater::Update>) {
        *self
            .pending
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = update;
    }

    fn take(&self) -> Option<tauri_plugin_updater::Update> {
        self.pending
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }
}

#[async_trait]
impl Updater for PluginUpdater {
    async fn check(&self) -> UpdaterCheck {
        // Infallible, exactly as v1: its body wraps the check in a try/catch
        // that logs and still answers `{ enabled: true }`, so a failed check
        // reaches the user as an `updater:error` event. `useUpdater` maps a
        // rejection and an error event to different states.
        self.events.send(UpdaterEvent::CheckingForUpdate);

        let updater = match self.app.updater() {
            Ok(updater) => updater,
            Err(error) => {
                self.events.send(UpdaterEvent::failed(error.to_string()));
                return UpdaterCheck::ENABLED;
            }
        };

        match updater.check().await {
            Ok(Some(update)) => {
                let info = describe(&update);
                self.remember(Some(update));
                self.events.send(UpdaterEvent::UpdateAvailable(info));
            }
            Ok(None) => {
                self.remember(None);
                // v1 receives the `UpdateInfo` here, logs the version, and
                // calls `sendToRenderer(channel)` with **no** second argument.
                // The renderer's listener is `(callback: () => void)`.
                self.events.send(UpdaterEvent::UpdateNotAvailable);
            }
            Err(error) => {
                self.events.send(UpdaterEvent::failed(error.to_string()));
            }
        }

        UpdaterCheck::ENABLED
    }

    async fn download(&self) -> Result<(), UpdaterFailure> {
        let Some(update) = self.take() else {
            // Reachable only if the renderer asks without a preceding
            // `updater:update-available`, which its own state machine does not
            // do. Rejecting beats succeeding silently, which would leave the UI
            // in `downloading` with nothing ever arriving.
            let message = "there is no update to download";
            self.events.send(UpdaterEvent::failed(message));
            return Err(UpdaterFailure::new(message));
        };

        let info = describe(&update);

        let events = Arc::clone(&self.events);
        let outcome = update
            .download(
                move |chunk, total| {
                    // v1's `download-progress` payload, from the two numbers the
                    // plugin reports. `total` is `Option` because a server may
                    // omit `Content-Length`; zero keeps the shape and lets the
                    // renderer's percentage read as indeterminate rather than
                    // dividing by nothing.
                    let total = total.unwrap_or(0) as f64;
                    let transferred = chunk as f64;
                    events.send(UpdaterEvent::DownloadProgress(UpdateDownloadProgress {
                        bytes_per_second: 0.0,
                        percent: if total > 0.0 {
                            transferred / total * 100.0
                        } else {
                            0.0
                        },
                        transferred,
                        total,
                    }));
                },
                || {},
            )
            .await;

        match outcome {
            Ok(bytes) => {
                // Keep the downloaded bytes for `install`: the plugin's
                // two-step API hands them back rather than staging them.
                self.remember(None);
                *self
                    .downloaded
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner) = Some((update, bytes));
                self.events.send(UpdaterEvent::UpdateDownloaded(info));
                Ok(())
            }
            Err(error) => {
                let message = error.to_string();
                self.events.send(UpdaterEvent::failed(&message));
                Err(UpdaterFailure::new(message))
            }
        }
    }

    async fn install(&self) -> Result<(), UpdaterFailure> {
        let staged = self
            .downloaded
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take();

        let Some((update, bytes)) = staged else {
            let message = "there is no downloaded update to install";
            self.events.send(UpdaterEvent::failed(message));
            return Err(UpdaterFailure::new(message));
        };

        match update.install(bytes) {
            // On success the process exits, so the renderer never observes this
            // resolving — which is why the command returns `void` rather than a
            // status.
            Ok(()) => Ok(()),
            Err(error) => {
                let message = error.to_string();
                self.events.send(UpdaterEvent::failed(&message));
                Err(UpdaterFailure::new(message))
            }
        }
    }
}
