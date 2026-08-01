//! `updater:*` — the auto-update surface, over a seam the plugin fills later.
//!
//! Three invoke channels and **six** events, ported from
//! `apps/desktop/src/main/ipc/updater.ts` and `app/updater.ts`. The largest
//! event-to-command ratio in the whole surface, and the reason is that the
//! renderer's update UI is driven almost entirely by the event stream: the three
//! commands are "start something", and everything the user sees comes back on a
//! channel.
//!
//! # Why this namespace has no domain crate
//!
//! Every other namespace delegates into a `shiranami-*` crate. This one cannot
//! yet: the real implementation is `tauri-plugin-updater` (§2.2 subsystem 6), and
//! wiring it is Phase 16's — it needs the app handle, the boot sequence's hourly
//! tick, and the minisign keypair that Phase 19 provisions. §4 also makes the
//! *handover* from `electron-updater` the project's #1 risk, which is a
//! separate piece of work again.
//!
//! What can land now, and what the renderer needs in order to be left unchanged
//! (§2.6), is the **shape**: three commands with v1's argument and return types,
//! six events with v1's channel names and byte-identical payloads, and one
//! trait — [`crate::seam::Updater`] — between them and whatever performs the
//! update. Phase 16 writes one implementation of that trait and the update UI
//! starts working with no renderer diff and no change to this file.
//!
//! So the wire vocabulary lives here rather than in `shiranami-core::models`,
//! beside the namespace that owns it, until there is a crate for it to move to.
//!
//! # v1's three commands, and the one that cannot fail
//!
//! | Channel                     | v1 resolves           | Can reject |
//! | --------------------------- | --------------------- | ---------- |
//! | `updater:check-for-updates` | `{ enabled: boolean }` | **no**     |
//! | `updater:start-download`    | `void`                | yes        |
//! | `updater:install-now`       | `void`                | yes        |
//!
//! All three took **no arguments** (`z.tuple([])` three times), and none was
//! registered with `handleWithFallback`.
//!
//! `checkForUpdates` not being able to fail is deliberate in v1 and is ported as
//! such: its body wraps the actual check in a `try`/`catch` that logs and falls
//! through to `return { enabled: true }`. A failed *check* therefore reaches the
//! user as an `updater:error` **event**, never as a rejected invoke — which
//! matters, because the renderer's `useUpdater` maps a rejection and an error
//! event to different states. [`crate::seam::Updater::check`] is infallible for
//! that reason.
//!
//! `enabled: false` is v1's "there is no updater here": `app/updater.ts` disables
//! itself in dev and on macOS (the app is unsigned — §4.3 records that v2 keeps
//! it that way until the Developer ID cert lands). An absent seam answers the
//! same way, which is also what `SHIRANAMI_E2E=1` should look like.
//!
//! # The six events are the contract, and three of them carry payloads
//!
//! | Channel                          | Payload                                     |
//! | -------------------------------- | ------------------------------------------- |
//! | `updater:checking-for-update`    | none                                        |
//! | `updater:update-available`       | [`UpdateInfo`]                              |
//! | `updater:update-not-available`   | none                                        |
//! | `updater:download-progress`      | [`UpdateDownloadProgress`]                  |
//! | `updater:update-downloaded`      | [`UpdateInfo`]                              |
//! | `updater:error`                  | a bare `string`                             |
//!
//! Two details of that table are load-bearing and both look like oversights:
//!
//! - **`update-not-available` drops its payload.** v1's handler receives the
//!   `UpdateInfo` and logs the version, then calls `sendToRenderer(channel)` with
//!   no second argument. The renderer's listener is `(callback: () => void)`.
//!   Adding the payload would be a wire change for a callback that takes no
//!   arguments.
//! - **`update-available` and `update-downloaded` carry `releaseNotes` and
//!   `releaseDate` that no renderer code reads.** A grep of `apps/web/src` finds
//!   only `.version` on both. They are ported anyway: they are on the wire today,
//!   the update UI is the surface most likely to grow a "what's new" panel, and
//!   dropping a field is not a decision this phase gets to make on the renderer's
//!   behalf.
//!
//! [`UpdaterEvent`] is the one place a transition is turned into a channel and a
//! payload, so Phase 16's implementation has nothing to get wrong beyond calling
//! it in the right order.
//!
//! # `RELEASE_PENDING` is a sentinel value on the error channel
//!
//! v1 classified one updater failure specially: a missing release manifest means
//! the release is published but its artifacts are still building, which is not
//! something to show a user. It sends the literal string `RELEASE_PENDING`
//! instead of the message, and `useUpdater` matches that literal and returns to
//! `idle` with no error and no toast.
//!
//! [`is_release_pending`] is v1's predicate verbatim, and [`RELEASE_PENDING`] is
//! v1's literal. **The predicate is written against `electron-updater`'s
//! wording** — `latest.yml` is electron-builder metadata that v2 does not
//! publish — so Phase 16 has to extend it with whatever
//! `tauri-plugin-updater` says when its manifest 404s. That is one function and
//! it is named here so the extension has an obvious home; guessing at the
//! plugin's wording now would be inventing a failure mode rather than porting
//! one. The renderer-visible half — the literal on the wire — is frozen either
//! way.

use std::borrow::Cow;

use serde::{Deserialize, Serialize};
use shiranami_core::error::{WireError, codes};
use specta::Type;
use specta_typescript::Number;
use tauri::State;
use tauri_specta::Event as _;

use std::sync::Arc;

use crate::error::{CommandResult, WireResultExt as _};
use crate::events;
use crate::state::{AppState, Deferred};

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::updater::updater_check_for_updates,
                crate::commands::updater::updater_start_download,
                crate::commands::updater::updater_install_now,
            ]
        }
    };
}
pub(crate) use commands;

/// The message `updater:error` carries when the release exists but its artifacts
/// do not yet.
///
/// A magic string on the wire, and the renderer matches it literally
/// (`if (message === 'RELEASE_PENDING')` in `useUpdater.ts`), so it is frozen.
pub const RELEASE_PENDING: &str = "RELEASE_PENDING";

/// What `updater:check-for-updates` answers.
///
/// v1's return type was the inline object `{ enabled: boolean }`, and `enabled`
/// means "this build has a working updater", not "an update was found" — the
/// answer to *that* arrives as an event. `useUpdater` reads only this field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterCheck {
    /// Whether this build can update itself at all.
    pub enabled: bool,
}

impl UpdaterCheck {
    /// v1's dev and macOS answer, and the answer when no updater is wired.
    pub const DISABLED: Self = Self { enabled: false };
    /// A check ran, whatever it found.
    pub const ENABLED: Self = Self { enabled: true };
}

/// Release metadata for `updater:update-available` and
/// `updater:update-downloaded`.
///
/// A field-for-field port of `UpdateInfo` in
/// `packages/contracts/src/ipc/preload-api.ts`, which v1 assembled from
/// electron-updater's own `UpdateInfo` — dropping everything else it carried,
/// and flattening `releaseNotes` on the way (see [`UpdateInfo::release_notes`]).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// The version being offered, as the manifest spells it.
    pub version: String,
    /// The release notes, or `None` when the release has none.
    ///
    /// electron-updater typed this `string | Array<ReleaseNoteInfo> | null` and
    /// v1 normalised it before sending: an array became its entries' `note`
    /// fields joined by a blank line, an empty value became `null`. The wire
    /// type is therefore `string | null`, and the key is always present.
    pub release_notes: Option<String>,
    /// The release timestamp, as a string, exactly as the manifest carries it.
    ///
    /// Never parsed on either side of the boundary in v1, so it stays a string
    /// rather than becoming an instant that would have to round-trip.
    pub release_date: String,
}

/// Byte progress for `updater:download-progress`.
///
/// Ported from electron-updater's `ProgressInfo`, minus `delta`, which v1 did
/// not forward. Every field is a JavaScript `number`: `transferred` and `total`
/// are byte counts and `percent` is 0–100 (the renderer does
/// `Math.round(p.percent)`), so they are `f64` here rather than integer types
/// that specta would emit as `bigint`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDownloadProgress {
    /// Current transfer rate in bytes per second.
    #[specta(type = Number)]
    pub bytes_per_second: f64,
    /// Percentage complete, 0–100.
    #[specta(type = Number)]
    pub percent: f64,
    /// Bytes received so far.
    #[specta(type = Number)]
    pub transferred: f64,
    /// Total bytes to receive.
    #[specta(type = Number)]
    pub total: f64,
}

/// A failure from the updater, on its way to the renderer as a rejection.
///
/// v1 let these cross as plain `Error`s, so `isIpcError(e)` was false for them
/// and the renderer's `switch (err.code)` saw `undefined`. §2.6 makes every
/// rejection code-bearing, and there is no updater entry in the frozen
/// registries, so these carry [`codes::INTERNAL`] — the code that exists exactly
/// for failures with no registry entry.
///
/// Hand-written rather than derived because `thiserror` is not a dependency of
/// the shell and adding one for a single-variant newtype is not worth a manifest
/// entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdaterFailure(pub String);

impl UpdaterFailure {
    /// Build a failure from anything that can describe itself.
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl std::fmt::Display for UpdaterFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for UpdaterFailure {}

impl WireError for UpdaterFailure {
    fn code(&self) -> Cow<'static, str> {
        Cow::Borrowed(codes::INTERNAL)
    }
}

/// One transition of v1's updater state machine, as it goes out to the renderer.
///
/// The six variants are the six events, and they exist as one enum so that the
/// mapping from "what happened" to "which channel, carrying what" is written
/// **once**. Phase 16's implementation of [`crate::seam::Updater`] produces
/// these; it does not name a channel or build a payload.
///
/// Deliberately **not** a `specta::Type`: it never crosses the boundary. The
/// values that do are the six newtypes in [`crate::events`], and adding this
/// enum to the bindings would put a seventh, redundant shape in front of the
/// renderer.
#[derive(Debug, Clone, PartialEq)]
pub enum UpdaterEvent {
    /// A check started.
    CheckingForUpdate,
    /// A newer version exists.
    UpdateAvailable(UpdateInfo),
    /// This build is current.
    UpdateNotAvailable,
    /// Bytes arrived.
    DownloadProgress(UpdateDownloadProgress),
    /// The update is downloaded and ready to install.
    UpdateDownloaded(UpdateInfo),
    /// Something failed. See [`UpdaterEvent::failed`] for the classifier.
    Failed(String),
}

impl UpdaterEvent {
    /// A failure, with v1's release-pending classification applied.
    ///
    /// Always use this rather than constructing [`UpdaterEvent::Failed`]
    /// directly: the classification is the difference between a quiet return to
    /// `idle` and an error toast during every release window.
    pub fn failed(message: impl Into<String>) -> Self {
        let message = message.into();
        if is_release_pending(&message) {
            Self::Failed(RELEASE_PENDING.to_owned())
        } else {
            Self::Failed(message)
        }
    }

    /// The channel and the exact bytes this transition puts on it.
    ///
    /// One match, and it reads the channel off the `Event` derives rather than
    /// restating the literals, so the `#[tauri_specta(event_name = …)]`
    /// attributes stay the single source of truth for all six names.
    fn wire(&self) -> (&'static str, serde_json::Value) {
        /// Serialize an event newtype. Every one is `#[serde(transparent)]` over
        /// its payload, so this is the payload itself and never a wrapper.
        fn payload_of<T: Serialize>(event: T) -> serde_json::Value {
            serde_json::to_value(event).expect("an updater event payload serializes")
        }

        match self {
            Self::CheckingForUpdate => (
                events::UpdaterCheckingForUpdate::NAME,
                payload_of(events::UpdaterCheckingForUpdate(())),
            ),
            Self::UpdateAvailable(info) => (
                events::UpdaterUpdateAvailable::NAME,
                payload_of(events::UpdaterUpdateAvailable(info.clone())),
            ),
            Self::UpdateNotAvailable => (
                events::UpdaterUpdateNotAvailable::NAME,
                payload_of(events::UpdaterUpdateNotAvailable(())),
            ),
            Self::DownloadProgress(progress) => (
                events::UpdaterDownloadProgress::NAME,
                payload_of(events::UpdaterDownloadProgress(*progress)),
            ),
            Self::UpdateDownloaded(info) => (
                events::UpdaterUpdateDownloaded::NAME,
                payload_of(events::UpdaterUpdateDownloaded(info.clone())),
            ),
            Self::Failed(message) => (
                events::UpdaterError::NAME,
                payload_of(events::UpdaterError(message.clone())),
            ),
        }
    }

    /// The v1 channel this transition goes out on.
    pub fn channel(&self) -> &'static str {
        self.wire().0
    }

    /// The payload, as JSON, exactly as v1's `webContents.send` carried it.
    ///
    /// The two argument-less events serialize to `null` where v1 passed no
    /// argument at all and the renderer received `undefined`. Both listeners are
    /// typed `(callback: () => void)` and neither reads the argument, so the
    /// difference is not observable — but it is the one place these payloads are
    /// not byte-identical, so it is written down rather than discovered.
    pub fn payload(&self) -> serde_json::Value {
        self.wire().1
    }

    /// Emit through the typed event, which is what registers the channel with
    /// Tauri's event system.
    ///
    /// # Errors
    ///
    /// Returns whatever Tauri's emitter returns; the payload cannot fail to
    /// serialize.
    pub fn emit<R: tauri::Runtime, H: tauri::Emitter<R> + tauri::Manager<R>>(
        &self,
        handle: &H,
    ) -> tauri::Result<()> {
        match self {
            Self::CheckingForUpdate => events::UpdaterCheckingForUpdate(()).emit(handle),
            Self::UpdateAvailable(info) => {
                events::UpdaterUpdateAvailable(info.clone()).emit(handle)
            }
            Self::UpdateNotAvailable => events::UpdaterUpdateNotAvailable(()).emit(handle),
            Self::DownloadProgress(progress) => {
                events::UpdaterDownloadProgress(*progress).emit(handle)
            }
            Self::UpdateDownloaded(info) => {
                events::UpdaterUpdateDownloaded(info.clone()).emit(handle)
            }
            Self::Failed(message) => events::UpdaterError(message.clone()).emit(handle),
        }
    }
}

/// v1's release-pending predicate, verbatim.
///
/// ```js
/// /Cannot find latest\.yml/.test(error.message) ||
///   (error.message.includes('.yml') && error.message.includes('404'))
/// ```
///
/// The regex has no metacharacters beyond an escaped dot, so a substring test is
/// the same test. See the module docs for why this is written against
/// electron-updater's wording and what Phase 16 has to add to it.
pub fn is_release_pending(message: &str) -> bool {
    message.contains("Cannot find latest.yml")
        || (message.contains(".yml") && message.contains("404"))
}

/// Where an updater transition goes.
///
/// A seam of its own, one method wide, because the thing that *produces* these
/// (Phase 16's updater implementation) and the thing that *delivers* them (an
/// `AppHandle`) are wired at different times — and because it is what lets a
/// full six-event lifecycle be driven and asserted in a `cargo test` with no
/// webview anywhere.
pub trait UpdaterEventSink: Send + Sync {
    /// Deliver one transition.
    ///
    /// Infallible, matching v1: `sendToRenderer` returned `false` when no window
    /// existed and threw nothing. An event nobody is listening for is dropped,
    /// deliberately — the updater's first check runs five seconds after launch
    /// and must not be able to fail a boot.
    fn send(&self, event: UpdaterEvent);
}

/// The production sink: emit into the webview.
pub struct AppUpdaterEvents<R: tauri::Runtime = tauri::Wry> {
    app: tauri::AppHandle<R>,
}

impl<R: tauri::Runtime> AppUpdaterEvents<R> {
    /// Emit updater events through this app handle.
    pub fn new(app: tauri::AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<R: tauri::Runtime> UpdaterEventSink for AppUpdaterEvents<R> {
    fn send(&self, event: UpdaterEvent) {
        if let Err(error) = event.emit(&self.app) {
            tracing::warn!(
                %error,
                channel = event.channel(),
                "an updater event did not reach the webview"
            );
        }
    }
}

/// `updater:check-for-updates` — ask whether this build updates itself, and
/// start a check if it does.
///
/// Cannot fail. See the module docs: v1 catches its own check failure and still
/// answers `{ enabled: true }`, so a failing check reaches the user as an
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
    let failed: Result<_, UpdaterFailure> = deferred
        .updater
        .as_ref()
        .ok_or_else(|| UpdaterFailure::new("this build has no updater"));

    failed.wire()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seam::fake::{FakeUpdater, RecordingUpdaterEvents};
    use serde_json::json;

    /// A state whose only wired piece is the updater under test.
    fn wired(updater: Arc<FakeUpdater>) -> Deferred {
        Deferred {
            updater: Some(updater as Arc<dyn crate::seam::Updater>),
            ..Deferred::default()
        }
    }

    fn info() -> UpdateInfo {
        UpdateInfo {
            version: "2.1.0".to_owned(),
            release_notes: Some("Faster scans.".to_owned()),
            release_date: "2026-08-01T12:00:00.000Z".to_owned(),
        }
    }

    /// The double's canonical progress tick, so the bytes asserted below and the
    /// bytes the lifecycle test sees are the same value rather than two copies.
    const fn progress() -> UpdateDownloadProgress {
        FakeUpdater::PROGRESS
    }

    // ── the wire contract ───────────────────────────────────────────────────

    /// v1's `{ enabled: boolean }`, which is the whole return type.
    #[test]
    fn the_check_result_is_v1s_enabled_flag() {
        assert_eq!(
            serde_json::to_value(UpdaterCheck::ENABLED).expect("serialize"),
            json!({ "enabled": true })
        );
        assert_eq!(
            serde_json::to_value(UpdaterCheck::DISABLED).expect("serialize"),
            json!({ "enabled": false })
        );
    }

    /// The three keys `sendToRenderer` carried, in v1's camelCase. The renderer
    /// reads `version`; the other two are on the wire and stay there.
    #[test]
    fn update_info_keeps_v1s_three_keys() {
        assert_eq!(
            serde_json::to_value(info()).expect("serialize"),
            json!({
                "version": "2.1.0",
                "releaseNotes": "Faster scans.",
                "releaseDate": "2026-08-01T12:00:00.000Z",
            })
        );
    }

    /// `parseReleaseNotes` returned `null`, not `undefined`, for a release with
    /// no notes — so the key is present and null rather than absent.
    #[test]
    fn absent_release_notes_serialize_as_null_rather_than_disappearing() {
        let json = serde_json::to_value(UpdateInfo {
            release_notes: None,
            ..info()
        })
        .expect("serialize");

        assert_eq!(json.get("releaseNotes"), Some(&serde_json::Value::Null));
    }

    /// Four keys, and `delta` — which electron-updater's `ProgressInfo` carries
    /// and v1 did not forward — is still absent.
    #[test]
    fn download_progress_keeps_v1s_four_keys_and_no_delta() {
        assert_eq!(
            serde_json::to_value(progress()).expect("serialize"),
            json!({
                "bytesPerSecond": 1_048_576.0,
                "percent": 42.5,
                "transferred": 4_456_448.0,
                "total": 10_485_760.0,
            })
        );
    }

    // ── the six transitions, byte for byte ──────────────────────────────────

    /// The whole event contract in one table: every transition, the channel v1
    /// sent it on, and the exact payload it carried.
    ///
    /// This is the test the Phase 15 shim is built against — it can listen on
    /// these six names and hand its callbacks these six values without the real
    /// updater existing.
    #[test]
    fn every_transition_carries_v1s_channel_and_v1s_bytes() {
        let expected = [
            (
                UpdaterEvent::CheckingForUpdate,
                "updater:checking-for-update",
                json!(null),
            ),
            (
                UpdaterEvent::UpdateAvailable(info()),
                "updater:update-available",
                json!({
                    "version": "2.1.0",
                    "releaseNotes": "Faster scans.",
                    "releaseDate": "2026-08-01T12:00:00.000Z",
                }),
            ),
            (
                UpdaterEvent::UpdateNotAvailable,
                "updater:update-not-available",
                json!(null),
            ),
            (
                UpdaterEvent::DownloadProgress(progress()),
                "updater:download-progress",
                json!({
                    "bytesPerSecond": 1_048_576.0,
                    "percent": 42.5,
                    "transferred": 4_456_448.0,
                    "total": 10_485_760.0,
                }),
            ),
            (
                UpdaterEvent::UpdateDownloaded(info()),
                "updater:update-downloaded",
                json!({
                    "version": "2.1.0",
                    "releaseNotes": "Faster scans.",
                    "releaseDate": "2026-08-01T12:00:00.000Z",
                }),
            ),
            (
                UpdaterEvent::Failed("ENOENT".to_owned()),
                "updater:error",
                json!("ENOENT"),
            ),
        ];

        for (event, channel, payload) in expected {
            assert_eq!(event.channel(), channel, "{event:?} changed channel");
            assert_eq!(event.payload(), payload, "{event:?} changed payload");
        }
    }

    /// All six, and no seventh: the namespace owns exactly the updater slice of
    /// the twenty-event surface.
    #[test]
    fn the_namespace_owns_six_of_the_twenty_event_channels() {
        let mine: Vec<&str> = crate::events::ALL_EVENT_NAMES
            .iter()
            .copied()
            .filter(|name| name.starts_with("updater:"))
            .collect();

        assert_eq!(mine.len(), 6, "v1's updater declares six event channels");
    }

    /// `updater:error` is a bare string, not an object. The renderer compares it
    /// to a literal, so wrapping it would break the comparison silently.
    #[test]
    fn the_error_event_is_a_bare_string() {
        assert!(UpdaterEvent::failed("boom").payload().is_string());
    }

    // ── the release-pending classifier ──────────────────────────────────────

    /// v1's two clauses. The first is not subsumed by the second: the message it
    /// matches contains `.yml` but no `404`.
    #[test]
    fn v1s_release_pending_messages_are_still_classified() {
        for message in [
            "Cannot find latest.yml in the latest release artifacts",
            "HttpError: 404 Not Found while fetching latest-mac.yml",
        ] {
            assert!(is_release_pending(message), "{message} must classify");
            assert_eq!(
                UpdaterEvent::failed(message),
                UpdaterEvent::Failed(RELEASE_PENDING.to_owned()),
                "the message is replaced by the sentinel, not appended to it"
            );
        }
    }

    /// A real failure keeps its own message: `useUpdater` shows it verbatim, and
    /// swallowing it under the sentinel would leave a broken updater looking
    /// permanently idle.
    #[test]
    fn an_ordinary_failure_keeps_its_message() {
        for message in [
            "ECONNREFUSED",
            "signature verification failed",
            "404 Not Found",
        ] {
            assert!(!is_release_pending(message), "{message} must not classify");
            assert_eq!(
                UpdaterEvent::failed(message),
                UpdaterEvent::Failed(message.to_owned())
            );
        }
    }

    // ── the seam, driven end to end ─────────────────────────────────────────

    #[tokio::test]
    async fn a_check_with_no_update_reports_enabled_and_says_so_on_the_wire() {
        let events = Arc::new(RecordingUpdaterEvents::default());
        let updater = FakeUpdater::up_to_date(Arc::clone(&events));

        assert_eq!(check(&wired(Arc::clone(&updater))).await, UpdaterCheck::ENABLED);

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

        assert_eq!(events.payloads(), vec![json!("RELEASE_PENDING")]);
    }

    /// A failure crosses code-bearing, which v1's did not: it let updater errors
    /// through as plain `Error`s, so `isIpcError(e)` was false and the
    /// renderer's `switch (err.code)` saw `undefined`.
    #[test]
    fn a_failure_crosses_with_the_internal_code() {
        let failed: Result<(), _> = Err(UpdaterFailure::new("signature verification failed"));

        let payload = failed.wire().expect_err("the failure survives");

        assert_eq!(payload.code, codes::INTERNAL);
        assert!(payload.message.contains("signature verification failed"));
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

    // ── the commands over an absent seam ────────────────────────────────────

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
