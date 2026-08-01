//! The two trait seams the shell owns, and why they are traits.
//!
//! Most of what [`crate::state::AppState`] holds is a concrete handle —
//! `SqlitePool`, `SettingsStore`, `HttpClient` all name one type with no
//! decisions left in them. Two do not, and both for the same reason: the crate
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
//! these two traits, so none of those choices can reach a command and none of
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
//!
//! `media:command` and the Discord settings pair are deliberately absent.
//! `media:command` travels the other way — it is an **event**, emitted when the
//! OS remote fires, so it belongs to `CommandSink` and to
//! [`crate::events`], not here. `discord-rpc:get-settings` and
//! `discord-rpc:update-settings` read and write the settings store, which the
//! command layer already holds directly.

use async_trait::async_trait;
use shiranami_core::models::DiscordMusicPresenceActivity;
use shiranami_media_controls::MediaState;

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
}

#[cfg(test)]
pub(crate) mod fake {
    //! Seam implementations that record instead of reaching an OS.
    //!
    //! The point of the seams is that a command can be tested with no Discord
    //! client running and no media surface to talk to; these are what makes that
    //! true, and they live here rather than in each test file so every lane
    //! tests its namespace against the same double.

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
    #[derive(Debug, Default)]
    pub(crate) struct RecordingPresence {
        updates: Mutex<Vec<Option<DiscordMusicPresenceActivity>>>,
    }

    impl RecordingPresence {
        /// Every update, in order. A `None` is "nothing playing", not "no call".
        pub(crate) fn updates(&self) -> Vec<Option<DiscordMusicPresenceActivity>> {
            self.updates
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
            self.updates
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .push(None);
        }
    }
}
