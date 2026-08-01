//! The production implementations of `crate::seam`'s three traits.
//!
//! `seam.rs` froze the method sets in Phase 14 and shipped only recording
//! doubles, because picking the concrete type behind each is a **boot**
//! decision:
//!
//! > Phase 16 picks the backend, the lock and the lifetime; the command layer
//! > only ever sees the traits below.
//!
//! This module is where those picks land. It is deliberately separate from
//! `boot::services`, which decides *whether* a service exists — here is *how* a
//! crate's API becomes the seam's.
//!
//! # Each adapter exists for a different reason
//!
//! - [`DiscordAdapter`] bridges an async trait onto a service whose two
//!   presence calls are **synchronous** — the crate queues into a state machine
//!   and a pump performs the effects, so `update` and `clear` return
//!   immediately. That is not laziness in the seam: the trait is `async` because
//!   `update_settings` genuinely is.
//! - [`MediaControlsAdapter`] wraps a `&mut`-only service in the lock its
//!   thread-affinity demands, which is the choice `seam.rs` says lives here.
//! - [`PluginUpdater`] is the only one with no crate behind it at all
//!   (`crate::commands::updater`), so it is the largest, and it lives in its own
//!   module.

use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use shiranami_core::models::{
    DiscordMusicPresenceActivity, DiscordRpcSettings, DiscordRpcSettingsPatch,
};
use shiranami_core::notice::NoticeSink;
use shiranami_integrations::discord::{DiscordPresence, PresenceSocket};
use shiranami_media_controls::{MediaControlsBackend, MediaControlsService, MediaState};

use crate::seam::{MediaControls, Presence};

/// `crate::seam::Presence` over `shiranami_integrations::discord`.
///
/// Generic over the socket and the notice sink for the same reason the service
/// is: `SHIRANAMI_E2E=1` runs with neither, and the tests behind the crate run
/// with doubles for both.
pub struct DiscordAdapter<S: PresenceSocket, N: NoticeSink> {
    inner: Arc<DiscordPresence<S, N>>,
}

impl<S: PresenceSocket, N: NoticeSink> DiscordAdapter<S, N> {
    /// Adapt a presence service to the seam.
    pub fn new(inner: Arc<DiscordPresence<S, N>>) -> Self {
        Self { inner }
    }

    /// The service itself, for the pump the composition root drives.
    ///
    /// The seam deliberately has no `pump`: it is not one of the four v1
    /// channels the trait's method set was taken from, and a command has no
    /// business advancing a clock. Boot reaches the service through here.
    pub fn service(&self) -> &Arc<DiscordPresence<S, N>> {
        &self.inner
    }
}

#[async_trait]
impl<S: PresenceSocket + Send + Sync + 'static, N: NoticeSink + Send + Sync + 'static> Presence
    for DiscordAdapter<S, N>
{
    async fn update(&self, activity: Option<DiscordMusicPresenceActivity>) {
        // Synchronous on the crate side: it marks the presence dirty and the
        // pump sends it, which is what keeps a settings save from bypassing
        // Discord's fifteen-second rate limit.
        self.inner.update_presence(activity);
    }

    async fn clear(&self) {
        self.inner.clear_presence();
    }

    async fn update_settings(&self, patch: DiscordRpcSettingsPatch) -> DiscordRpcSettings {
        self.inner.update_settings(patch).await
    }
}

/// `crate::seam::MediaControls` over `shiranami_media_controls`.
///
/// # The lock is the decision `seam.rs` deferred here
///
/// `MediaControlsService::update` takes `&mut self`, and the seam hands out
/// `&self` behind an `Arc` — so something has to provide the interior
/// mutability. A `std::sync::Mutex` rather than `tokio`'s, and that is not the
/// usual "it guards plain data" argument:
///
/// - The guarded value is **not** `Send` on macOS or Windows.
///   `MediaControlsBackend` carries no `Send` bound precisely because
///   `SystemMediaTransportControls` belongs to the thread that owns the window
///   handle, so a `tokio::sync::Mutex` — whose guard is held across awaits and
///   may resume on a different worker — is the wrong tool by construction.
/// - Nothing is awaited while it is held. Every call inside is a synchronous OS
///   write, which is why `clippy::await_holding_lock` stays satisfied.
pub struct MediaControlsAdapter<B: MediaControlsBackend> {
    inner: Mutex<MediaControlsService<B>>,
}

impl<B: MediaControlsBackend> MediaControlsAdapter<B> {
    /// Adapt a media-controls service to the seam.
    pub fn new(inner: MediaControlsService<B>) -> Self {
        Self {
            inner: Mutex::new(inner),
        }
    }

    /// Push anything the update gate deferred.
    ///
    /// Boot drives this from a timer; `Applied::Deferred` is the gate saying
    /// "too soon, ask again", and without a caller the last state change before
    /// a pause would never reach the OS.
    pub fn flush_due(&self, now: std::time::Instant) {
        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        if let Err(error) = guard.flush_due(now) {
            tracing::warn!(%error, "the OS media surface refused a deferred update");
        }
    }
}

#[async_trait]
impl<B: MediaControlsBackend + Send + 'static> MediaControls for MediaControlsAdapter<B> {
    async fn publish(&self, state: MediaState) {
        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        // Infallible from the command layer's point of view, matching v1: a
        // media surface that refuses an update is cosmetic, and failing the
        // renderer's call would make it a visible error on every track change.
        if let Err(error) = guard.update(std::time::Instant::now(), state) {
            tracing::warn!(%error, "the OS media surface refused an update");
        }
    }

    async fn clear(&self) {
        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        if let Err(error) = guard.detach() {
            tracing::warn!(%error, "the OS media surface refused to clear");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_media_controls::NullBackend;

    /// The adapter satisfies the seam over the crate's own null backend, and
    /// neither call panics or blocks. Cheap, and it is the only place the two
    /// `async_trait` impls are exercised at all without an OS surface.
    #[tokio::test]
    async fn the_media_adapter_publishes_and_clears_over_a_null_backend() {
        let adapter = MediaControlsAdapter::new(MediaControlsService::new(NullBackend));

        adapter.publish(MediaState::default()).await;
        adapter.flush_due(std::time::Instant::now());
        adapter.clear().await;
    }

    /// The seam is object-safe with the production adapter behind it — the
    /// property every `Deferred` field depends on, and one a `&mut`-taking
    /// service would have broken without the lock above.
    #[test]
    fn the_media_adapter_is_usable_as_the_seam() {
        let adapter: Arc<dyn MediaControls> = Arc::new(MediaControlsAdapter::new(
            MediaControlsService::new(NullBackend),
        ));

        assert_eq!(Arc::strong_count(&adapter), 1);
    }
}
