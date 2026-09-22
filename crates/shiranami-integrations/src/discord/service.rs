//! The Rich Presence lifecycle: enable, connect, update, disable.
//!
//! Ported from the public API of
//! `apps/desktop/src/main/integrations/discord-rpc.ts`. The pure parts live in
//! [`super::payload`] and [`super::reconnect`]; this is the shell that owns a
//! socket and a settings store and moves between them.
//!
//! # No timers here
//!
//! v1 held two: a reconnect `setTimeout` and a throttle `setTimeout`. Both are
//! replaced by a single `await` inside [`DiscordPresence::pump`], which the
//! composition root calls in a loop. That keeps the crate free of a runtime
//! handle — the rule §2.3 states as "`tauri::async_runtime::spawn`, never bare
//! `tokio::spawn`", which is best obeyed by not spawning at all — and it makes
//! the whole lifecycle drivable from a test with a paused clock.
//!
//! # Every socket call is blocking
//!
//! `discord-rich-presence` writes to a Unix socket or a named pipe
//! synchronously, so each call goes through `spawn_blocking`. The socket is
//! owned by the blocking side for the duration and handed back, which is what
//! keeps a `&mut` API safe across an await without a lock spanning one.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use shiranami_core::models::{
    DiscordMusicPresenceActivity, DiscordRpcSettings, DiscordRpcSettingsPatch,
};
use shiranami_core::notice::{NoticeGate, NoticeSink, SystemNotice, SystemNoticeSource, codes};
use shiranami_core::store::SettingsStore;
use shiranami_core::sync::lock_or_recover;

use crate::discord::payload::build_presence;
use crate::discord::reconnect::{ReconnectState, UpdateTiming};
use crate::discord::settings;
use crate::discord::socket::PresenceSocket;

/// What the driver should do after a [`DiscordPresence::pump`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pump {
    /// Nothing is pending; wait for the next presence update or settings change.
    Idle,
    /// Call `pump` again — there is more to do, after `retry_in` at the latest.
    Again {
        /// How long the caller may wait first.
        retry_in: Duration,
    },
}

/// The desired presence, and what has been shown so far.
struct State {
    reconnect: ReconnectState,
    /// The activity the user is on now. `None` is a genuine idle presence, not
    /// "nothing to show" — v1 re-emitted `null` through the same throttle.
    current: Option<DiscordMusicPresenceActivity>,
    /// Whether [`State::current`] still needs to reach Discord.
    dirty: bool,
}

/// The Rich Presence service.
pub struct DiscordPresence<S: PresenceSocket, N: NoticeSink> {
    store: Arc<SettingsStore>,
    /// `Option` so the blocking half can take ownership for the duration of a
    /// call and put it back, rather than holding a lock across an await.
    socket: Arc<Mutex<Option<S>>>,
    state: Arc<Mutex<State>>,
    notices: Arc<NoticeGate<N>>,
}

impl<S: PresenceSocket, N: NoticeSink> DiscordPresence<S, N> {
    /// Build a service over `socket`.
    pub fn new(store: Arc<SettingsStore>, socket: S, notices: Arc<NoticeGate<N>>) -> Self {
        Self {
            store,
            socket: Arc::new(Mutex::new(Some(socket))),
            state: Arc::new(Mutex::new(State {
                reconnect: ReconnectState::default(),
                current: None,
                dirty: false,
            })),
            notices,
        }
    }

    /// The stored settings.
    pub fn settings(&self) -> DiscordRpcSettings {
        settings::load(&self.store)
    }

    /// Whether the socket is believed to be up.
    pub fn is_connected(&self) -> bool {
        lock_or_recover(&self.state).reconnect.is_connected()
    }

    /// Apply a settings change and re-render the presence.
    ///
    /// Switching Rich Presence off tears the connection down immediately;
    /// switching it on, or changing how the card reads, marks the presence dirty
    /// so the next pump re-sends it **through the throttle** — v1 was careful
    /// not to let a settings save bypass Discord's rate limit.
    pub async fn update_settings(&self, patch: DiscordRpcSettingsPatch) -> DiscordRpcSettings {
        let next = match settings::update(&self.store, patch) {
            Ok(next) => next,
            Err(error) => {
                tracing::warn!(%error, "could not persist the discord settings");
                self.settings()
            }
        };

        if next.enabled {
            lock_or_recover(&self.state).dirty = true;
        } else {
            self.shutdown().await;
        }

        tracing::info!(
            enabled = next.enabled,
            show_track_details = next.show_track_details,
            show_elapsed_time = next.show_elapsed_time,
            use_custom_templates = next.use_custom_templates,
            "discord settings updated"
        );
        next
    }

    /// Record the now-playing snapshot to show. `None` is an idle presence.
    ///
    /// Returns immediately; the send happens in the next [`Self::pump`]. This is
    /// the call on the playback path, so it does no I/O at all.
    pub fn update_presence(&self, activity: Option<DiscordMusicPresenceActivity>) {
        let mut state = lock_or_recover(&self.state);
        state.current = activity;
        state.dirty = true;
    }

    /// Take the presence card down, keeping the connection.
    pub fn clear_presence(&self) {
        let mut state = lock_or_recover(&self.state);
        state.current = None;
        state.dirty = true;
    }

    /// Do the next unit of work: connect if needed, or send a pending update.
    ///
    /// Returns whether there is more to do. The caller loops on it; a test calls
    /// it a step at a time.
    ///
    /// `now_ms` is the clock the rate-limit window and the card's countdown are
    /// measured against, passed in rather than read for the same reason
    /// [`build_presence`] takes it: crossing a fifteen-second window is a case
    /// worth testing, and it is not worth fifteen seconds of test runtime.
    /// [`now_ms`] is what the composition root passes.
    pub async fn pump(&self, now_ms: i64) -> Pump {
        let settings = self.settings();
        if !settings.enabled {
            return Pump::Idle;
        }

        if !self.is_connected() {
            return self.connect().await;
        }

        let (activity, timing) = {
            let state = lock_or_recover(&self.state);
            if !state.dirty {
                return Pump::Idle;
            }
            (state.current.clone(), state.reconnect.timing(now_ms))
        };

        // Reporting the wait rather than sleeping through it is what lets a later
        // update replace this one for free: the state is re-read on the next
        // pump, so only the newest snapshot is ever sent.
        if let UpdateTiming::After(delay) = timing {
            return Pump::Again { retry_in: delay };
        }

        self.send(activity, &settings, now_ms).await
    }

    /// Tear the connection down deliberately.
    ///
    /// Clears the card first, so a user who switches Rich Presence off stops
    /// showing one immediately rather than leaving a stale card until Discord
    /// notices the socket closed.
    pub async fn shutdown(&self) {
        let had_socket = self.is_connected();
        if had_socket {
            let _ = self.on_socket(PresenceSocket::clear_activity).await;
            let _ = self.on_socket(PresenceSocket::close).await;
        }

        let mut state = lock_or_recover(&self.state);
        state.reconnect.on_shutdown();
        state.dirty = false;
        drop(state);

        // A deliberate teardown ends the failed state, so a fresh enable can
        // surface a new login failure rather than staying silent.
        self.notices
            .reset(SystemNoticeSource::Discord, codes::DISCORD_LOGIN_FAILED);
    }

    /// Attempt a connection, backing off and notifying on failure.
    async fn connect(&self) -> Pump {
        match self.on_socket(PresenceSocket::connect).await {
            Ok(()) => {
                lock_or_recover(&self.state).reconnect.on_connected();
                self.notices
                    .reset(SystemNoticeSource::Discord, codes::DISCORD_LOGIN_FAILED);
                tracing::info!("connected to discord");
                // Re-emit whatever is current, through the throttle, so a
                // reconnect storm cannot trip the rate limit.
                lock_or_recover(&self.state).dirty = true;
                Pump::Again {
                    retry_in: Duration::ZERO,
                }
            }
            Err(error) => {
                // Kept at `warn`: "Discord is not running" and a genuine
                // handshake failure are indistinguishable here, and at `info`
                // the failure was completely invisible in v1.
                tracing::warn!(%error, "discord login failed, backing off");

                let failure = lock_or_recover(&self.state).reconnect.on_connect_failed();
                if failure.notify {
                    self.notices.emit(&SystemNotice::warn(
                        SystemNoticeSource::Discord,
                        codes::DISCORD_LOGIN_FAILED,
                    ));
                }
                Pump::Again {
                    retry_in: failure.retry_in,
                }
            }
        }
    }

    /// Render and send one presence card.
    async fn send(
        &self,
        activity: Option<DiscordMusicPresenceActivity>,
        settings: &DiscordRpcSettings,
        now_ms: i64,
    ) -> Pump {
        let payload = build_presence(activity.as_ref(), settings, now_ms);
        let outcome = self
            .on_socket(move |socket| socket.set_activity(&payload))
            .await;

        let mut state = lock_or_recover(&self.state);
        match outcome {
            Ok(()) => {
                state.reconnect.on_update_sent(now_ms);
                state.dirty = false;
                Pump::Idle
            }
            Err(error) => {
                // The only way a dropped socket is discovered: v1 learned it
                // from a `disconnected` event this crate does not have.
                tracing::warn!(%error, "could not update the discord presence");
                state.reconnect.on_disconnected();
                Pump::Again {
                    retry_in: Duration::ZERO,
                }
            }
        }
    }

    /// Run one blocking socket call off the runtime workers.
    async fn on_socket<F>(&self, call: F) -> Result<(), crate::discord::socket::SocketError>
    where
        F: FnOnce(&mut S) -> Result<(), crate::discord::socket::SocketError> + Send + 'static,
    {
        let holder = Arc::clone(&self.socket);

        let joined = tokio::task::spawn_blocking(move || {
            // Taken out and put back rather than borrowed, so no lock is held
            // across the await this result is delivered through.
            let mut taken = lock_or_recover(&holder).take();
            let outcome = taken.as_mut().map(call).unwrap_or_else(|| Ok(()));
            *lock_or_recover(&holder) = taken;
            outcome
        })
        .await;

        match joined {
            Ok(outcome) => outcome,
            // A panic inside the socket library is a failed call, not a failed
            // app: the reconnect path treats it like any other socket error.
            Err(error) => Err(crate::discord::socket::SocketError::from_source(&error)),
        }
    }
}

/// Unix milliseconds now — what the composition root passes to [`DiscordPresence::pump`].
///
/// Re-exported from [`crate::clock`], the crate's shared clock. Phase 12 landed
/// this and the scrobbler in parallel lanes, so it pointed at
/// `scrobble::now_ms` — a module boundary presence has no other reason to
/// cross. Phase 14 gave both a shared owner.
pub use crate::clock::now_ms;
