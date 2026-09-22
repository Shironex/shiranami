//! The trait seams the shell owns, and why they are traits.
//!
//! Most of what [`crate::state::AppState`] holds is a concrete handle —
//! `SqlitePool`, `SettingsStore`, `HttpClient` all name one type with no
//! decisions left in them. Three do not. Two of them share a reason: the crate
//! behind them is generic over an implementation detail whose value is a **boot**
//! decision, not a command-layer one.
//!
//! - `shiranami_media_controls::MediaControlsService<B>` is generic over its
//!   backend. Production is souvlaki, which is compiled on Windows and macOS
//!   only, needs a live window handle on Windows and a running run loop on
//!   macOS, and carries thread-affinity constraints that decide what lock — if
//!   any — has to wrap it.
//! - `shiranami_integrations::discord::DiscordPresence<S, N>` is generic over its
//!   socket and its notice sink, and `SHIRANAMI_E2E=1` runs with neither.
//!
//! Architecture §2.3 says exactly what to do about that: no globals,
//! `Arc<dyn Trait>` seams, and the seam lives in a rank-1 module. Phase 16 picks
//! the backend, the lock and the lifetime; the command layer only ever sees
//! the traits below, so none of those choices can reach a command and none of
//! them can be re-litigated in twenty-one parallel lanes.
//!
//! # The method sets are not invented
//!
//! Each trait has exactly the operations v1's channels for it name, so a lane
//! implementing a namespace against this seam is porting rather than designing:
//!
//! | v1 channel                    | Seam method                          |
//! | ----------------------------- | ------------------------------------ |
//! | `media:playback-state`        | [`MediaControls::publish`]           |
//! | `media:clear-state`           | [`MediaControls::clear`]             |
//! | `discord-rpc:update-presence` | [`Presence::update`]                 |
//! | `discord-rpc:clear-presence`  | [`Presence::clear`]                  |
//! | `updater:check-for-updates`   | [`Updater::check`]                   |
//! | `updater:start-download`      | [`Updater::download`]                |
//! | `updater:install-now`         | [`Updater::install`]                 |
//! | `discord-rpc:update-settings` | [`Presence::update_settings`]        |
//!
//! `media:command` and `discord-rpc:get-settings` are deliberately absent.
//! `media:command` travels the other way — it is an **event**, emitted when the
//! OS remote fires, so it belongs to `CommandSink` and to
//! [`crate::events`], not here. `discord-rpc:get-settings` is a pure read of the
//! settings store, which the command layer already holds directly, and it has to
//! answer on a run that has no Discord at all.
//!
//! # Why `update-settings` is a seam method and its sibling read is not
//!
//! The kickoff placed both settings channels outside this trait, on the
//! reasoning that both only touch the store. That holds for the read and does
//! **not** hold for the write: v1's `updateDiscordRpcSettings` persists and then
//! connects, disconnects, or re-renders the card, and
//! `DiscordPresence::update_settings` reproduces all three. Routing the write
//! through the store alone would leave a stale presence card up after a user
//! switches Rich Presence off — the socket would stay open until Discord noticed
//! it close on its own, which is a visible port regression rather than a
//! deferred effect. The command layer still writes the store directly when the
//! seam is absent, because a run with no Discord has nothing to tear down.
//!
//! # The third seam is here for a different reason
//!
//! [`MediaControls`] and [`Presence`] are traits because their concrete type is
//! a **boot** decision. [`Updater`] is a trait because there is no concrete type
//! yet at all: the implementation is `tauri-plugin-updater`, which Phase 16
//! wires and Phase 19 provisions a signing key for, and §4 makes the handover
//! from `electron-updater` a project risk with its own plan. Ending up with the
//! command surface blocked on that is the outcome the seam avoids — the three
//! channels, the six events and their payloads are frozen against v1 now, and
//! Phase 16 writes one implementation behind them.

use async_trait::async_trait;
use shiranami_core::models::{
    DiscordMusicPresenceActivity, DiscordRpcSettings, DiscordRpcSettingsPatch,
};
use shiranami_media_controls::MediaState;

use crate::commands::updater::{UpdaterCheck, UpdaterFailure};

/// The OS media surface — SMTC on Windows, `MPNowPlayingInfoCenter` on macOS.
///
/// Both methods are infallible from the command layer's point of view, matching
/// v1: `media:playback-state` and `media:clear-state` returned `void` and their
/// handlers swallowed backend failures. A media surface that refuses an update
/// is a cosmetic problem on a machine whose OS integration is already degraded;
/// failing the renderer's call would turn it into a visible error on every
/// track change. Implementations log instead.
#[async_trait]
pub trait MediaControls: Send + Sync {
    /// Show this playback state on the OS surface.
    ///
    /// Coalescing is the implementation's job, not the caller's. The renderer
    /// pushes on every playhead tick, and `UpdateGate`'s interval is what keeps
    /// that from becoming an OS call per frame.
    async fn publish(&self, state: MediaState);

    /// Take the app off the OS surface.
    async fn clear(&self);
}

/// Discord Rich Presence.
///
/// v1 registered both channels with `handleWithFallback` and an `undefined`
/// fallback — a Discord that is not running is the normal case, not an error —
/// so these return nothing and the fallback semantics live here rather than in
/// each caller.
#[async_trait]
pub trait Presence: Send + Sync {
    /// Render this activity as the presence card, through the throttle.
    ///
    /// `None` means "nothing is playing", which v1 re-emitted through the same
    /// throttle rather than short-circuiting — a detail that matters because a
    /// settings save must not be able to bypass Discord's fifteen-second rate
    /// limit.
    async fn update(&self, activity: Option<DiscordMusicPresenceActivity>);

    /// Clear the presence card.
    async fn clear(&self);

    /// Persist a settings change and act on it, returning the merged settings.
    ///
    /// Not a store write with a return value: switching Rich Presence **off**
    /// tears the socket down immediately, and switching it on — or changing how
    /// the card reads — marks the presence dirty so the next pump re-sends it
    /// *through* the throttle. v1 was careful that a settings save could not
    /// bypass Discord's fifteen-second rate limit, and that care is inside the
    /// implementation rather than in the caller.
    async fn update_settings(&self, patch: DiscordRpcSettingsPatch) -> DiscordRpcSettings;
}

/// The auto-updater, as v1's three channels name it.
///
/// Every method is also an **event emitter**: v1's renderer learns what happened
/// from the `updater:*` event stream, not from these return values, so an
/// implementation calls `crate::commands::updater::UpdaterEventSink::send` as it
/// goes. The return values are only what the invoke resolves to.
///
/// The asymmetry between [`Updater::check`] and the other two is v1's and is
/// load-bearing — see `crate::commands::updater`.
#[async_trait]
pub trait Updater: Send + Sync {
    /// Start a check, and report whether this build has an updater at all.
    ///
    /// **Infallible.** v1 wraps the check in a `try`/`catch` that logs and still
    /// answers `{ enabled: true }`; a failed check reaches the user as an
    /// `updater:error` event. `useUpdater` maps a rejection and an error event to
    /// different states, so making this fallible would change what the UI shows
    /// for a network blip during the hourly tick.
    async fn check(&self) -> UpdaterCheck;

    /// Download the update that was found.
    ///
    /// # Errors
    ///
    /// Whatever the underlying updater failed with. v1's handler re-threw, and
    /// the renderer's mutation surfaces it.
    async fn download(&self) -> Result<(), UpdaterFailure>;

    /// Quit and install.
    ///
    /// # Errors
    ///
    /// As [`Updater::download`]. On success the process exits, so the renderer
    /// never observes this resolving.
    async fn install(&self) -> Result<(), UpdaterFailure>;
}

#[cfg(test)]
pub(crate) mod fake {
    //! Seam implementations that record instead of reaching an OS.
    //!
    //! The point of the seams is that a command can be tested with no Discord
    //! client running, no media surface to talk to and no release to install;
    //! these are what makes that true, and they live here rather than in each
    //! test file so every lane tests its namespace against the same double.

    #![allow(
        dead_code,
        reason = "one double per seam; each namespace lane uses the one it needs"
    )]

    use super::*;
    use std::sync::Mutex;

    /// Records what the command layer published.
    #[derive(Debug, Default)]
    pub(crate) struct RecordingMediaControls {
        published: Mutex<Vec<MediaState>>,
        cleared: Mutex<usize>,
    }

    impl RecordingMediaControls {
        /// How many times `clear` was called.
        pub(crate) fn clear_count(&self) -> usize {
            *self.cleared.lock().unwrap_or_else(|poisoned| {
                // `lock_or_recover` semantics: a poisoned mutex guards plain
                // data here, so recovering beats propagating a panic.
                poisoned.into_inner()
            })
        }

        /// Everything published, in order.
        pub(crate) fn published(&self) -> Vec<MediaState> {
            self.published
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .clone()
        }
    }

    #[async_trait]
    impl MediaControls for RecordingMediaControls {
        async fn publish(&self, state: MediaState) {
            self.published
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .push(state);
        }

        async fn clear(&self) {
            *self
                .cleared
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) += 1;
        }
    }

    /// Records what the command layer asked Discord to show.
    ///
    /// `clear` is counted rather than recorded as an `update(None)`, because the
    /// two are **not** the same call and v1 uses both: `media:clear-state` sends
    /// `update(None)`, which re-renders "nothing playing" through the
    /// fifteen-second throttle, while `discord-rpc:clear-presence` tears the card
    /// down. A double that collapsed them would let either channel be wired to
    /// the wrong one with every test still green.
    #[derive(Debug, Default)]
    pub(crate) struct RecordingPresence {
        updates: Mutex<Vec<Option<DiscordMusicPresenceActivity>>>,
        /// Separate from `updates` because [`Presence::clear`] and
        /// `update(None)` are the same *card* and different *calls*; a test that
        /// asserts one happened must not be satisfied by the other.
        cleared: Mutex<usize>,
        /// The merged settings, so the double behaves like the real service:
        /// a patch applies over what the previous patch left behind.
        settings: Mutex<DiscordRpcSettings>,
        patches: Mutex<Vec<DiscordRpcSettingsPatch>>,
    }

    impl RecordingPresence {
        /// Every update, in order. A `None` is "nothing playing", not "no call".
        pub(crate) fn updates(&self) -> Vec<Option<DiscordMusicPresenceActivity>> {
            self.updates
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .clone()
        }

        /// How many times `clear` was called.
        pub(crate) fn clear_count(&self) -> usize {
            *self
                .cleared
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
        }

        /// Every settings patch the command layer handed over, in order.
        pub(crate) fn patches(&self) -> Vec<DiscordRpcSettingsPatch> {
            self.patches
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .clone()
        }
    }

    #[async_trait]
    impl Presence for RecordingPresence {
        async fn update(&self, activity: Option<DiscordMusicPresenceActivity>) {
            self.updates
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .push(activity);
        }

        async fn clear(&self) {
            *self
                .cleared
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) += 1;
        }

        async fn update_settings(&self, patch: DiscordRpcSettingsPatch) -> DiscordRpcSettings {
            self.patches
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .push(patch.clone());

            let mut settings = self
                .settings
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            *settings = settings.clone().patched(patch);
            settings.clone()
        }
    }

    use crate::commands::updater::{
        UpdateDownloadProgress, UpdateInfo, UpdaterEvent, UpdaterEventSink,
    };
    use std::sync::Arc;

    /// Records the updater transitions that would have reached the webview.
    ///
    /// The three accessors answer the three questions the port has about an
    /// event: which channel, in what order, carrying what. `payloads` returns
    /// JSON rather than the enum on purpose — the renderer sees bytes, and a
    /// payload assertion that reads the Rust value back proves only that the
    /// enum round-trips through itself.
    #[derive(Debug, Default)]
    pub(crate) struct RecordingUpdaterEvents {
        sent: Mutex<Vec<UpdaterEvent>>,
    }

    impl RecordingUpdaterEvents {
        /// Every transition, in order.
        pub(crate) fn recorded(&self) -> Vec<UpdaterEvent> {
            self.sent
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .clone()
        }

        /// The channels they went out on, in order.
        pub(crate) fn channels(&self) -> Vec<&'static str> {
            self.recorded().iter().map(UpdaterEvent::channel).collect()
        }

        /// The bytes they carried, in order.
        pub(crate) fn payloads(&self) -> Vec<serde_json::Value> {
            self.recorded().iter().map(UpdaterEvent::payload).collect()
        }
    }

    impl UpdaterEventSink for RecordingUpdaterEvents {
        fn send(&self, event: UpdaterEvent) {
            self.sent
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .push(event);
        }
    }

    /// An updater that emits v1's event sequence without an updater existing.
    ///
    /// Deliberately a *scripted* double rather than a bare recorder: the thing
    /// worth asserting about this namespace is the **order and the bytes** of the
    /// six transitions, because that sequence is the entire contract the Phase 15
    /// shim and the renderer's `useUpdater` state machine are built against.
    /// Recording only the calls would leave the half that matters untested until
    /// Phase 16.
    #[derive(Debug)]
    pub(crate) struct FakeUpdater {
        events: Arc<RecordingUpdaterEvents>,
        /// What a check finds. `None` is "already current".
        available: Option<UpdateInfo>,
        /// When set, the check reports itself disabled and emits nothing.
        disabled: bool,
        /// When set, acting fails with this message.
        failure: Option<String>,
        calls: Mutex<Vec<&'static str>>,
    }

    impl FakeUpdater {
        /// The one progress tick the double emits mid-download.
        pub(crate) const PROGRESS: UpdateDownloadProgress = UpdateDownloadProgress {
            bytes_per_second: 1_048_576.0,
            percent: 42.5,
            transferred: 4_456_448.0,
            total: 10_485_760.0,
        };

        fn new(events: Arc<RecordingUpdaterEvents>) -> Self {
            Self {
                events,
                available: None,
                disabled: false,
                failure: None,
                calls: Mutex::new(Vec::new()),
            }
        }

        /// A working updater with nothing to offer.
        pub(crate) fn up_to_date(events: Arc<RecordingUpdaterEvents>) -> Arc<Self> {
            Arc::new(Self::new(events))
        }

        /// A working updater offering `info`, which downloads and installs.
        pub(crate) fn offering(info: UpdateInfo, events: Arc<RecordingUpdaterEvents>) -> Arc<Self> {
            Arc::new(Self {
                available: Some(info),
                ..Self::new(events)
            })
        }

        /// v1's dev and macOS build: present, gated, silent.
        pub(crate) fn disabled(events: Arc<RecordingUpdaterEvents>) -> Arc<Self> {
            Arc::new(Self {
                disabled: true,
                ..Self::new(events)
            })
        }

        /// An updater whose download and install both fail with `message`.
        pub(crate) fn failing(
            message: impl Into<String>,
            events: Arc<RecordingUpdaterEvents>,
        ) -> Arc<Self> {
            Arc::new(Self {
                failure: Some(message.into()),
                ..Self::new(events)
            })
        }

        /// Which seam methods were called, in order.
        pub(crate) fn calls(&self) -> Vec<&'static str> {
            self.calls
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .clone()
        }

        fn record(&self, call: &'static str) {
            self.calls
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .push(call);
        }

        /// The shared failure path: v1 both emitted on `updater:error` and let
        /// the invoke reject, so the double does both too.
        fn fail(&self, message: &str) -> UpdaterFailure {
            self.events.send(UpdaterEvent::failed(message));
            UpdaterFailure::new(message)
        }
    }

    #[async_trait]
    impl Updater for FakeUpdater {
        async fn check(&self) -> UpdaterCheck {
            self.record("check");
            if self.disabled {
                // v1 returns before touching autoUpdater, so no event fires.
                return UpdaterCheck::DISABLED;
            }

            self.events.send(UpdaterEvent::CheckingForUpdate);
            match &self.available {
                Some(info) => self
                    .events
                    .send(UpdaterEvent::UpdateAvailable(info.clone())),
                None => self.events.send(UpdaterEvent::UpdateNotAvailable),
            }
            UpdaterCheck::ENABLED
        }

        async fn download(&self) -> Result<(), UpdaterFailure> {
            self.record("download");
            if let Some(message) = &self.failure {
                return Err(self.fail(message));
            }

            self.events
                .send(UpdaterEvent::DownloadProgress(Self::PROGRESS));
            if let Some(info) = &self.available {
                self.events
                    .send(UpdaterEvent::UpdateDownloaded(info.clone()));
            }
            Ok(())
        }

        async fn install(&self) -> Result<(), UpdaterFailure> {
            self.record("install");
            match &self.failure {
                Some(message) => Err(self.fail(message)),
                None => Ok(()),
            }
        }
    }
}
