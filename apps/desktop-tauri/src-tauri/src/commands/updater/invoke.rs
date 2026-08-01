//! The three invoke channels, and what each does when nothing is wired.
//!
//! All three took **no arguments** in v1 (`z.tuple([])` three times) and none was
//! registered with `handleWithFallback`, so there is no validation and no
//! substituted value anywhere in this file — only the seam, and the answer for a
//! build that has no updater behind it.

use std::sync::Arc;

use tauri::State;

use super::contract::{UpdaterCheck, UpdaterFailure};
use crate::error::{CommandResult, WireResultExt as _};
use crate::state::{AppState, Deferred};

/// Register this namespace's commands with [`crate::commands::registry`].
///
/// The paths name this module rather than the parent's re-exports: `tauri`'s
/// `generate_handler!` resolves a sibling macro next to each function, so the
/// path it is given has to be where the function actually lives.
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::updater::invoke::updater_check_for_updates,
                crate::commands::updater::invoke::updater_start_download,
                crate::commands::updater::invoke::updater_install_now,
            ]
        }
    };
}
pub(crate) use commands;

/// `updater:check-for-updates` — ask whether this build updates itself, and
/// start a check if it does.
///
/// Cannot fail. See the parent module: v1 catches its own check failure and
/// still answers `{ enabled: true }`, so a failing check reaches the user as an
/// `updater:error` event. An absent seam answers `{ enabled: false }`, which is
/// v1's answer in dev and on macOS.
#[tauri::command]
#[specta::specta]
pub async fn updater_check_for_updates(state: State<'_, AppState>) -> CommandResult<UpdaterCheck> {
    Ok(check(state.deferred()).await)
}

/// `updater:start-download` — download the update that was found.
#[tauri::command]
#[specta::specta]
pub async fn updater_start_download(state: State<'_, AppState>) -> CommandResult<()> {
    download(state.deferred()).await
}

/// `updater:install-now` — quit and install.
///
/// v1's `quitAndInstall()` does not return in the success case: the app exits.
/// The renderer's mutation is therefore never observed resolving, only
/// rejecting, which is why this returns `void` rather than a status.
#[tauri::command]
#[specta::specta]
pub async fn updater_install_now(state: State<'_, AppState>) -> CommandResult<()> {
    install(state.deferred()).await
}

// The three bodies below are extracted for the reason `weather::validate_query`
// is: `tauri::State` has no public constructor, so a command taking one cannot
// be called from a unit test. Testing a copy of the logic instead is testing a
// copy that can quietly stop matching what runs.

/// v1's `checkForUpdates()`, including its inability to fail.
async fn check(deferred: &Deferred) -> UpdaterCheck {
    match &deferred.updater {
        Some(updater) => updater.check().await,
        None => UpdaterCheck::DISABLED,
    }
}

/// v1's `downloadUpdate()`.
async fn download(deferred: &Deferred) -> CommandResult<()> {
    updater(deferred)?.download().await.wire()
}

/// v1's `quitAndInstall()`.
async fn install(deferred: &Deferred) -> CommandResult<()> {
    updater(deferred)?.install().await.wire()
}

/// The seam, or the failure to send back when this build has no updater.
///
/// Only the two *acting* commands go through here, never the check. v1's
/// `downloadUpdate` and `quitAndInstall` are **ungated** — they reach
/// `autoUpdater` directly even in a build whose check returned
/// `{ enabled: false }`, and reject when it has nothing to do — so a rejection
/// is the faithful answer rather than a silent success that would leave the UI
/// showing "downloading" forever. In practice the renderer only reaches these
/// after an `updater:update-available` event, which an absent seam cannot have
/// emitted.
fn updater(deferred: &Deferred) -> CommandResult<&Arc<dyn crate::seam::Updater>> {
    let found: Result<_, UpdaterFailure> = deferred
        .updater
        .as_ref()
        .ok_or_else(|| UpdaterFailure::new("this build has no updater"));

    found.wire()
}

#[cfg(test)]
mod tests {
    use super::super::contract::sample_release as info;
    use super::*;
    use crate::seam::fake::{FakeUpdater, RecordingUpdaterEvents};
    use shiranami_core::error::codes;

    /// A state whose only wired piece is the updater under test.
    fn wired(updater: Arc<FakeUpdater>) -> Deferred {
        Deferred {
            updater: Some(updater as Arc<dyn crate::seam::Updater>),
            ..Deferred::default()
        }
    }

    #[tokio::test]
    async fn a_check_with_no_update_reports_enabled_and_says_so_on_the_wire() {
        let events = Arc::new(RecordingUpdaterEvents::default());
        let updater = FakeUpdater::up_to_date(Arc::clone(&events));

        assert_eq!(
            check(&wired(Arc::clone(&updater))).await,
            UpdaterCheck::ENABLED
        );

        assert_eq!(
            events.channels(),
            ["updater:checking-for-update", "updater:update-not-available"]
        );
        assert_eq!(updater.calls(), ["check"]);
    }

    /// The full lifecycle the update UI walks: check → available → progress →
    /// downloaded. All six transitions are exercised across this test and the
    /// two below it.
    #[tokio::test]
    async fn a_full_update_lifecycle_emits_v1s_sequence() {
        use super::super::events::UpdaterEvent;

        let events = Arc::new(RecordingUpdaterEvents::default());
        let updater = FakeUpdater::offering(info(), Arc::clone(&events));
        let deferred = wired(Arc::clone(&updater));

        assert_eq!(check(&deferred).await, UpdaterCheck::ENABLED);
        download(&deferred).await.expect("the download succeeds");
        install(&deferred).await.expect("the install succeeds");

        assert_eq!(
            events.channels(),
            [
                "updater:checking-for-update",
                "updater:update-available",
                "updater:download-progress",
                "updater:update-downloaded",
            ]
        );
        assert_eq!(
            events.recorded(),
            vec![
                UpdaterEvent::CheckingForUpdate,
                UpdaterEvent::UpdateAvailable(info()),
                UpdaterEvent::DownloadProgress(FakeUpdater::PROGRESS),
                UpdaterEvent::UpdateDownloaded(info()),
            ]
        );
        assert_eq!(updater.calls(), ["check", "download", "install"]);
    }

    /// A download failure both rejects the invoke **and** puts the message on
    /// the error channel — v1 did both, and the renderer's two consumers read
    /// different halves (`useUpdater` the event, the mutation the rejection).
    #[tokio::test]
    async fn a_failed_download_rejects_and_emits_the_error_event() {
        use super::super::events::UpdaterEvent;

        let events = Arc::new(RecordingUpdaterEvents::default());
        let updater = FakeUpdater::failing("ECONNREFUSED", Arc::clone(&events));

        let payload = download(&wired(updater))
            .await
            .expect_err("the download fails");

        assert_eq!(payload.code, codes::INTERNAL);
        assert!(payload.message.contains("ECONNREFUSED"));
        assert_eq!(events.channels(), ["updater:error"]);
        assert_eq!(
            events.recorded(),
            vec![UpdaterEvent::Failed("ECONNREFUSED".to_owned())]
        );
    }

    /// The classification survives the seam: a release-pending failure reaches
    /// the wire as the sentinel, so the UI returns to `idle` instead of showing
    /// a toast for a release that is still building.
    #[tokio::test]
    async fn a_release_pending_failure_reaches_the_wire_as_the_sentinel() {
        let events = Arc::new(RecordingUpdaterEvents::default());
        let updater = FakeUpdater::failing("Cannot find latest.yml", Arc::clone(&events));

        download(&wired(updater))
            .await
            .expect_err("the download fails");

        assert_eq!(events.payloads(), vec![serde_json::json!("RELEASE_PENDING")]);
    }

    /// v1 gated only the check: an updater that reports itself disabled has
    /// touched nothing and emitted nothing, which is what dev and macOS builds
    /// do on every hourly tick.
    #[tokio::test]
    async fn a_disabled_updater_answers_without_emitting_anything() {
        let events = Arc::new(RecordingUpdaterEvents::default());
        let updater = FakeUpdater::disabled(Arc::clone(&events));

        assert_eq!(check(&wired(updater)).await, UpdaterCheck::DISABLED);

        assert!(events.recorded().is_empty());
    }

    /// Phase 16 has not booted, or `SHIRANAMI_E2E=1` is set. The check answers
    /// exactly as v1's disabled build did, so the settings pane renders its
    /// "updates are not available in this build" state rather than an error.
    #[tokio::test]
    async fn an_absent_updater_reports_itself_disabled_rather_than_failing() {
        assert_eq!(check(&Deferred::default()).await, UpdaterCheck::DISABLED);
    }

    /// …and the two acting commands reject, because succeeding silently would
    /// leave the UI in `downloading` with nothing ever arriving.
    #[tokio::test]
    async fn an_absent_updater_refuses_to_download_or_install() {
        for outcome in [
            download(&Deferred::default()).await,
            install(&Deferred::default()).await,
        ] {
            let payload = outcome.expect_err("an absent updater cannot act");
            assert_eq!(payload.code, codes::INTERNAL);
        }
    }
}
