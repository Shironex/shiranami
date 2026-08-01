//! The six transitions, and the one place each becomes a channel and a payload.
//!
//! The renderer's update UI is an event-driven state machine — `useUpdater`'s
//! `UpdateStatus` union (`idle | checking | available | downloading | ready |
//! error`) lives entirely in `apps/web` and never crosses the boundary; what
//! crosses is these six events, and the state is derived from them. So the
//! ordering and the bytes here *are* the contract, and getting either wrong
//! produces a UI stuck in a state with no error anywhere.
//!
//! Writing the mapping once, in [`UpdaterEvent`], is what leaves Phase 16's
//! implementation with nothing to get wrong beyond calling it in the right
//! order.

use serde::Serialize;
use tauri_specta::Event as _;

use super::contract::{UpdateDownloadProgress, UpdateInfo};
use crate::events;

/// The message `updater:error` carries when the release exists but its artifacts
/// do not yet.
///
/// A magic string on the wire, and the renderer matches it literally
/// (`if (message === 'RELEASE_PENDING')` in `useUpdater.ts`), so it is frozen.
pub const RELEASE_PENDING: &str = "RELEASE_PENDING";

/// One transition of v1's updater state machine, as it goes out to the renderer.
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
/// the same test. See the parent module for why this is written against
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

#[cfg(test)]
mod tests {
    use super::super::contract::sample_release as info;
    use super::*;
    use serde_json::json;

    fn progress() -> UpdateDownloadProgress {
        UpdateDownloadProgress {
            bytes_per_second: 1_048_576.0,
            percent: 42.5,
            transferred: 4_456_448.0,
            total: 10_485_760.0,
        }
    }

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
}
