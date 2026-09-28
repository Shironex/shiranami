//! Opt-in automatic updates for the managed yt-dlp and ffmpeg: the scheduler,
//! the failure trigger, and telling the user.
//!
//! `shiranami_downloader::update` decides *when* and does *one* update; this is
//! the part that needs the shell: a task on the async runtime, the settings
//! store, the download queue and the notice channel.
//!
//! # Off unless the user turned it on
//!
//! The opt-in is a field inside the renderer `settings` blob, read with
//! `== Some(true)`, for the reason `boot::services` gives for the lyrics
//! write-back opt-in: `RendererStoreKey` is pinned to v1's tuple, and the blob
//! is already writable from both shells. An absent field is a user who never
//! opted in, and that must read as off: this feature replaces executables on
//! the user's machine unattended.
//!
//! It is read on every tick rather than captured, so turning it off takes
//! effect at once. Turning it **on** also wakes the scheduler through the
//! settings change bus, so "turn it on with an old yt-dlp installed" updates
//! within seconds rather than at the next hourly tick.
//!
//! Under `SHIRANAMI_E2E=1` none of this starts: `boot::reconcile` calls
//! [`spawn`] only after its E2E gate, the same gate as the app updater.
//!
//! # Two triggers, one at a time
//!
//! - **Scheduled.** A first pass [`FIRST_CHECK_DELAY`] after boot, off the
//!   startup path, then every [`TICK`]. Each pass updates whatever
//!   `policy::due_tools` says is due, so the hourly tick costs nothing while
//!   nothing is. ffmpeg is never due on macOS: evermeet.cx publishes no
//!   checksum, so it is only ever replaced by the user's own click there.
//! - **A failed download** that `failure_kind` reads as a site change checks
//!   yt-dlp immediately, ignoring its 24 h window, at most once an hour. If a
//!   newer yt-dlp lands, the downloads that failed that way are retried, each
//!   at most once.
//!
//! A `tokio::sync::Mutex` serialises the two, so a failure arriving while the
//! scheduler is mid-swap waits for it instead of staging the same release
//! twice. It is the one lock here held across an await, and that is its job.
//!
//! # Telling the user, quietly
//!
//! A successful update raises one `info` system notice ("yt-dlp updated to
//! 2026.09.20"). A failure is logged; only a *repeated* failure raises a
//! `warn` notice, once per streak (`policy::REPEATED_FAILURES`). No OS
//! notifications and no modals: the notice channel is the in-app toast.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::Value;
use shiranami_core::models::{Tool, ToolAutoUpdateState};
use shiranami_core::notice::{NoticeGate, NoticeMetaValue};
use shiranami_core::store::{MainStoreKey, RendererStoreKey, SettingsStore};
use shiranami_core::sync::lock_or_recover;
use shiranami_core::time::now_ms;
use shiranami_core::{SystemNotice, SystemNoticeLevel, SystemNoticeSource};
use shiranami_downloader::DownloaderError;
use shiranami_downloader::bin::Platform;
use shiranami_downloader::queue::{DownloadQueue, FailureObserver};
use shiranami_downloader::spawn::failure_kind;
use shiranami_downloader::update::{QueueGate, UpdateOutcome, policy, update_tool};
use tauri::{AppHandle, Manager as _};

use crate::commands::system::EventNoticeSink;
use crate::downloads::DownloaderServices;
use crate::state::AppState;

/// The field inside the renderer `settings` blob that carries the opt-in.
///
/// Spelled once here and once in the renderer's `useToolAutoUpdate`; the two
/// must agree, and a typo on either side is a toggle that never takes effect.
pub const AUTO_UPDATE_TOOLS_FIELD: &str = "autoUpdateTools";

/// The first scheduled pass, after boot.
///
/// Long enough to stay off the startup path (the window, the library, the
/// queue's own hydrate), short enough that "turn it on, relaunch" visibly
/// updates within about a minute.
pub const FIRST_CHECK_DELAY: Duration = Duration::from_secs(45);

/// How often the scheduler looks at the windows again.
pub const TICK: Duration = Duration::from_secs(60 * 60);

/// Whether the user opted in. Absent or malformed reads as off.
pub fn enabled(settings: &SettingsStore) -> bool {
    settings
        .get(RendererStoreKey::Settings)
        .and_then(|blob| blob.get(AUTO_UPDATE_TOOLS_FIELD).and_then(Value::as_bool))
        .unwrap_or(false)
}

/// The persisted bookkeeping, or a fresh record when absent or unreadable.
///
/// Unreadable degrades to fresh rather than failing, for the tool status
/// cache's reason: the cost of a miss is one extra check.
pub fn load_state(settings: &SettingsStore) -> ToolAutoUpdateState {
    settings
        .get_main(MainStoreKey::DownloadsAutoUpdate)
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn save_state(settings: &SettingsStore, state: &ToolAutoUpdateState) {
    // `installing` is live state from the install locks, filled in per read by
    // the status command. It is never bookkeeping, so it is never written.
    let mut state = state.clone();
    state.ytdlp.installing = false;
    state.ffmpeg.installing = false;

    let saved = serde_json::to_value(&state)
        .map_err(|error| error.to_string())
        .and_then(|value| {
            settings
                .set_main(MainStoreKey::DownloadsAutoUpdate, value)
                .map_err(|error| error.to_string())
        });
    if let Err(error) = saved {
        // Not fatal: the worst case is one repeated check after a restart.
        tracing::warn!(%error, "could not persist the tool auto-update record");
    }
}

/// Roll back any binary swap a crash left unfinished, before anything spawns.
///
/// Called by the queue's boot-time hydrate before it resumes downloads, so a
/// resumed download never starts against a half-swapped yt-dlp or a mixed
/// ffmpeg pair. The check is each manager's `is_installed`, which rolls a
/// pending swap back first (`bin::swap::recover`); with no swap pending it is
/// four file-existence checks. Runs whether or not automatic updates are on,
/// because a manual install can be interrupted too.
pub async fn recover_interrupted_swaps(state: &AppState) {
    if let Some(services) = state.deferred().downloader.as_deref() {
        services.tools().check().await;
    }
}

/// Everything one update pass needs, built once at boot.
struct AutoUpdater {
    settings: Arc<SettingsStore>,
    services: Arc<DownloaderServices>,
    queue: Arc<DownloadQueue>,
    notices: NoticeGate<EventNoticeSink>,
    /// Serialises the scheduled pass and failure-triggered checks.
    running: tokio::sync::Mutex<()>,
    /// Wakes the scheduler early, when the user turns the setting on.
    wake: tokio::sync::Notify,
    /// Downloads that failed the way a newer yt-dlp might fix.
    suspects: Mutex<HashSet<String>>,
    /// Downloads already retried once after an update, never retried again.
    retried: Mutex<HashSet<String>>,
}

/// Start automatic updating. Returns immediately; does nothing while the
/// setting is off.
///
/// Called by `boot::reconcile` after its E2E gate. A missing downloader or
/// queue (they are `Option`s in `Deferred`) means there is nothing to update.
pub fn spawn(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let (Some(services), Some(queue)) = (
        state.deferred().downloader.clone(),
        state.deferred().downloads.clone(),
    ) else {
        return;
    };

    let updater = Arc::new(AutoUpdater {
        settings: Arc::clone(state.settings()),
        services,
        queue: Arc::clone(&queue),
        notices: crate::commands::system::notices(app.clone()),
        running: tokio::sync::Mutex::new(()),
        wake: tokio::sync::Notify::new(),
        suspects: Mutex::new(HashSet::new()),
        retried: Mutex::new(HashSet::new()),
    });

    queue.observe_failures(Arc::new(FailureHook(Arc::clone(&updater))));

    let waker = Arc::clone(&updater);
    updater
        .settings
        .bus()
        .subscribe(RendererStoreKey::Settings.path(), move |event| {
            let turned_on = |value: &Option<Value>| {
                value
                    .as_ref()
                    .and_then(|blob| blob.get(AUTO_UPDATE_TOOLS_FIELD))
                    .and_then(Value::as_bool)
                    == Some(true)
            };
            if turned_on(&event.current) && !turned_on(&event.previous) {
                waker.wake.notify_one();
            }
        });

    tauri::async_runtime::spawn(async move {
        updater.sleep_or_wake(FIRST_CHECK_DELAY).await;
        loop {
            if enabled(&updater.settings) {
                updater.scheduled_pass().await;
            }
            updater.sleep_or_wake(TICK).await;
        }
    });
}

impl AutoUpdater {
    /// Wait `period`, or less if the user turns the setting on meanwhile.
    async fn sleep_or_wake(&self, period: Duration) {
        // Either way the answer is "go look now"; which one fired is moot.
        let _woken = tokio::time::timeout(period, self.wake.notified()).await;
    }

    /// Update every tool whose window has passed.
    async fn scheduled_pass(&self) {
        let _running = self.running.lock().await;

        // `HOST`, not a parameter: ffmpeg on macOS is never due (its upstream
        // publishes no checksum; see `update::policy`).
        for tool in policy::due_tools(&load_state(&self.settings), now_ms(), Platform::HOST) {
            let outcome = self.update(tool).await;
            self.record(tool, &outcome);
        }
    }

    /// A failed download, possibly the site changing under yt-dlp.
    async fn after_failure(&self, id: String, reason: String) {
        if !enabled(&self.settings) || !failure_kind(&reason).suggests_outdated_yt_dlp() {
            return;
        }
        lock_or_recover(&self.suspects).insert(id);

        let _running = self.running.lock().await;
        let mut state = load_state(&self.settings);
        let now = now_ms();
        if !policy::may_check_after_failure(&state, now) {
            tracing::debug!("a failed download suggests a stale yt-dlp; checked within the hour");
            return;
        }
        policy::note_failure_check(&mut state, now);
        save_state(&self.settings, &state);

        tracing::info!("a failed download suggests a stale yt-dlp; checking now");
        let outcome = self.update(Tool::Ytdlp).await;
        self.record(Tool::Ytdlp, &outcome);

        if matches!(outcome, UpdateOutcome::Updated { .. }) {
            self.retry_suspects().await;
        }
    }

    /// Retry each download that failed like a site change, at most once ever.
    async fn retry_suspects(&self) {
        let suspects: Vec<String> = lock_or_recover(&self.suspects).drain().collect();
        for id in suspects {
            if lock_or_recover(&self.retried).insert(id.clone()) {
                tracing::info!(id, "retrying a download after updating yt-dlp");
                self.queue.retry(&id).await;
            }
        }
    }

    async fn update(&self, tool: Tool) -> UpdateOutcome {
        let gate = QueueGate::new(Arc::clone(&self.queue));
        update_tool(tool, self.services.tools(), &gate).await
    }

    /// Persist an outcome and announce what it says to announce.
    fn record(&self, tool: Tool, outcome: &UpdateOutcome) {
        tracing::info!(?tool, ?outcome, "automatic tool update check finished");

        let mut state = load_state(&self.settings);
        let consequence = policy::apply_outcome(&mut state, tool, outcome, now_ms());
        save_state(&self.settings, &state);

        if let Some(version) = consequence.announce_update {
            // The status cache names the old version; the next settings render
            // recomputes it.
            crate::commands::downloader::tools::invalidate(&self.settings);
            self.notices
                .emit(&notice(tool, SystemNoticeLevel::Info, Some(version)));
        }
        if consequence.announce_failure {
            self.notices
                .emit(&notice(tool, SystemNoticeLevel::Warn, None));
        }
    }
}

/// The notice for `tool` at `level`: an update when `version` is given, a
/// repeated failure otherwise.
fn notice(tool: Tool, level: SystemNoticeLevel, version: Option<String>) -> SystemNotice {
    use shiranami_core::notice::codes;

    let code = match (tool, version.is_some()) {
        (Tool::Ytdlp, true) => codes::YTDLP_AUTO_UPDATED,
        (Tool::Ffmpeg, true) => codes::FFMPEG_AUTO_UPDATED,
        (Tool::Ytdlp, false) => codes::YTDLP_AUTO_UPDATE_FAILED,
        (Tool::Ffmpeg, false) => codes::FFMPEG_AUTO_UPDATE_FAILED,
    };

    SystemNotice {
        source: SystemNoticeSource::Downloader,
        level,
        code: code.to_owned(),
        meta: version.map(|version| {
            std::iter::once(("version".to_owned(), NoticeMetaValue::Text(version))).collect()
        }),
    }
}

/// The queue's failure callback, handing off to a task: the queue calls it
/// from its own download task, which must not wait on an update check.
struct FailureHook(Arc<AutoUpdater>);

impl FailureObserver for FailureHook {
    fn failed(&self, id: &str, _url: &str, error: &DownloaderError) {
        let updater = Arc::clone(&self.0);
        let (id, reason) = (id.to_owned(), error.to_string());
        tauri::async_runtime::spawn(async move {
            updater.after_failure(id, reason).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store(dir: &std::path::Path) -> SettingsStore {
        SettingsStore::load(dir.join("config.json")).0
    }

    #[test]
    fn the_setting_is_off_unless_explicitly_true() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let settings = store(dir.path());
        assert!(!enabled(&settings), "a fresh install never auto-updates");

        for (blob, expected) in [
            (serde_json::json!({}), false),
            (serde_json::json!({ "autoUpdateTools": false }), false),
            (serde_json::json!({ "autoUpdateTools": "yes" }), false),
            (serde_json::json!({ "autoUpdateTools": true }), true),
        ] {
            settings
                .set(RendererStoreKey::Settings, blob.clone())
                .expect("write the blob");
            assert_eq!(enabled(&settings), expected, "{blob}");
        }
    }

    #[test]
    fn the_record_round_trips_and_an_unreadable_one_reads_as_fresh() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let settings = store(dir.path());
        assert_eq!(load_state(&settings), ToolAutoUpdateState::default());

        let mut state = ToolAutoUpdateState::default();
        state.ytdlp.last_checked_at = Some(1_790_000_000_000);
        save_state(&settings, &state);
        assert_eq!(load_state(&store(dir.path())), state, "survives a restart");

        settings
            .set_main(MainStoreKey::DownloadsAutoUpdate, Value::from("garbage"))
            .expect("write");
        assert_eq!(load_state(&settings), ToolAutoUpdateState::default());
    }

    #[test]
    fn an_update_notice_is_info_and_names_the_version() {
        let json = serde_json::to_value(notice(
            Tool::Ytdlp,
            SystemNoticeLevel::Info,
            Some("2026.09.20".to_owned()),
        ))
        .expect("encode");

        assert_eq!(json["source"], "downloader");
        assert_eq!(json["level"], "info");
        assert_eq!(json["code"], "ytdlpAutoUpdated");
        assert_eq!(json["meta"]["version"], "2026.09.20");
    }

    #[test]
    fn a_failure_notice_is_per_tool_so_one_does_not_mute_the_other() {
        let ytdlp = notice(Tool::Ytdlp, SystemNoticeLevel::Warn, None);
        let ffmpeg = notice(Tool::Ffmpeg, SystemNoticeLevel::Warn, None);

        assert_ne!(ytdlp.dedup_key(), ffmpeg.dedup_key());
        assert_eq!(ffmpeg.code, "ffmpegAutoUpdateFailed");
        assert_eq!(ffmpeg.meta, None);
    }
}
