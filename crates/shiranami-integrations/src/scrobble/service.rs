//! The scrobbler: settings, submission, and the flush over the parked queue.
//!
//! Ported from the service shell of
//! `apps/desktop/src/main/scrobble/scrobbler.ts` — everything that is not a
//! pure payload builder or the queue state machine.
//!
//! # Nothing here is on the playback path
//!
//! v1's `submitPlay` was fire-and-forget: it returned immediately, ran the
//! submission in the background, and caught every failure. That property is the
//! whole design, and it is preserved by shape rather than by discipline —
//! [`Scrobbler::submit`] does network work and touches no database, so the
//! caller can run it off the playback path and only then take a connection to
//! park what failed.
//!
//! # Why the connection is not held across the network
//!
//! The pool holds exactly one connection (Phase 6), so anything holding it
//! across a ten-second HTTP timeout stalls every query in the app for ten
//! seconds. Both database-touching entry points here therefore take a
//! `&SqlitePool` and acquire in short bursts around the network work, never
//! through it:
//!
//! * [`Scrobbler::submit_play`] — submit, then one write if anything failed;
//! * [`Scrobbler::flush`] — one read of the due rows, then submissions, then
//!   one write pass over the results.
//!
//! This is the same rule `repo/mod.rs` states for commands, applied to a
//! background task: acquire late, release early, and never await the network
//! with a connection in hand.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use md5::{Digest, Md5};
use shiranami_core::models::{
    LastfmAuthStart, ScrobbleConnectError, ScrobbleConnectResult, ScrobbleStatus,
};
use shiranami_core::store::{ScrobbleSettings, SettingsStore};
use shiranami_db::repo::scrobble_queue::{self, QueuedScrobble, ScrobbleTargets};
use sqlx::SqlitePool;

use crate::scrobble::error::{Result, ScrobbleError};
use crate::scrobble::lastfm::{LastfmClient, LastfmCredentials};
use crate::scrobble::listenbrainz::ListenBrainzClient;
use crate::scrobble::play::ScrobblePlay;
use crate::scrobble::settings::{active_targets, save, status};

/// How often the retry queue is flushed. The composition root owns the timer.
pub const FLUSH_INTERVAL_SECS: u64 = 60;

/// The scrobbling service.
///
/// Holds no queue of its own — the queue is a table now — and no timer; the
/// composition root drives [`Scrobbler::flush`] on its own interval, which is
/// what keeps this crate free of a runtime handle.
pub struct Scrobbler {
    store: Arc<SettingsStore>,
    lastfm: Option<LastfmClient>,
    listenbrainz: ListenBrainzClient,
}

impl Scrobbler {
    /// Build a scrobbler over `store`, with Last.fm enabled only when this
    /// build carries an application credential.
    pub fn new(
        store: Arc<SettingsStore>,
        http: shiranami_net::HttpClient,
        credentials: Option<LastfmCredentials>,
    ) -> Self {
        Self {
            lastfm: credentials.map(|credentials| LastfmClient::new(http.clone(), credentials)),
            listenbrainz: ListenBrainzClient::new(http),
            store,
        }
    }

    /// Replace the backend clients, for tests driving a loopback server.
    #[must_use]
    pub fn with_clients(
        mut self,
        lastfm: Option<LastfmClient>,
        listenbrainz: ListenBrainzClient,
    ) -> Self {
        self.lastfm = lastfm;
        self.listenbrainz = listenbrainz;
        self
    }

    /// Whether this build can talk to Last.fm at all.
    pub fn is_lastfm_configured(&self) -> bool {
        self.lastfm.is_some()
    }

    /// The connection status the Settings UI renders.
    ///
    /// # Errors
    ///
    /// Returns [`ScrobbleError::Queue`] when the parked count cannot be read.
    pub async fn status(&self, pool: &SqlitePool) -> Result<ScrobbleStatus> {
        let pending = self.pending_count(pool).await?;
        Ok(status(&self.settings(), pending))
    }

    /// Flip the master switch and return the new status.
    ///
    /// # Errors
    ///
    /// Returns [`ScrobbleError::Queue`] when the status cannot be read back,
    /// and drops a settings-write failure to a log — v1's `store.set` threw
    /// into the same `catch` that produced no user-visible result.
    pub async fn set_enabled(&self, pool: &SqlitePool, enabled: bool) -> Result<ScrobbleStatus> {
        self.update_settings(|settings| settings.enabled = enabled);
        self.status(pool).await
    }

    /// Start the Last.fm desktop-auth handshake.
    ///
    /// Returns the wire result together with the URL the composition root has
    /// to open — v1 opened it here through Electron's `shell.openExternal`,
    /// which has no equivalent at this layer.
    pub async fn begin_lastfm_auth(&self) -> (LastfmAuthStart, Option<String>) {
        let Some(lastfm) = &self.lastfm else {
            return (
                LastfmAuthStart::failed(ScrobbleConnectError::NotConfigured),
                None,
            );
        };

        match lastfm.begin_auth().await {
            Ok(started) => (
                LastfmAuthStart::started(started.token),
                Some(started.authorize_url),
            ),
            Err(error) => {
                tracing::warn!(%error, "last.fm begin-auth failed");
                (LastfmAuthStart::failed(error.connect_reason()), None)
            }
        }
    }

    /// Finish the Last.fm handshake, storing the session key on success.
    ///
    /// v1 also flipped `enabled` on here, so connecting a backend is what turns
    /// scrobbling on for a user who never touched the master switch.
    pub async fn complete_lastfm_auth(&self, token: &str) -> ScrobbleConnectResult {
        let Some(lastfm) = &self.lastfm else {
            return ScrobbleConnectResult::failed(ScrobbleConnectError::NotConfigured);
        };

        match lastfm.complete_auth(token).await {
            Ok(session) => {
                let username = session.username.clone();
                self.update_settings(|settings| {
                    settings.enabled = true;
                    settings.lastfm_session_key = Some(session.key);
                    settings.lastfm_username = session.username;
                });
                ScrobbleConnectResult::connected(username)
            }
            Err(error) => {
                tracing::warn!(%error, "last.fm complete-auth failed");
                ScrobbleConnectResult::failed(error.connect_reason())
            }
        }
    }

    /// Forget the Last.fm session.
    ///
    /// # Errors
    ///
    /// Returns [`ScrobbleError::Queue`] when the status cannot be read back.
    pub async fn disconnect_lastfm(&self, pool: &SqlitePool) -> Result<ScrobbleStatus> {
        self.update_settings(|settings| {
            settings.lastfm_session_key = None;
            settings.lastfm_username = None;
        });
        self.status(pool).await
    }

    /// Validate and store a ListenBrainz user token.
    pub async fn connect_listenbrainz(&self, token: &str) -> ScrobbleConnectResult {
        match self.listenbrainz.validate(token).await {
            Ok(username) => {
                self.update_settings(|settings| {
                    settings.enabled = true;
                    settings.listen_brainz_token = Some(token.to_owned());
                });
                ScrobbleConnectResult::connected(username)
            }
            Err(error) => {
                tracing::warn!(%error, "listenbrainz connect failed");
                ScrobbleConnectResult::failed(error.connect_reason())
            }
        }
    }

    /// Forget the ListenBrainz token.
    ///
    /// # Errors
    ///
    /// Returns [`ScrobbleError::Queue`] when the status cannot be read back.
    pub async fn disconnect_listenbrainz(&self, pool: &SqlitePool) -> Result<ScrobbleStatus> {
        self.update_settings(|settings| settings.listen_brainz_token = None);
        self.status(pool).await
    }

    /// Submit a finished play, parking it if any backend refused.
    ///
    /// Never returns an error for a failed submission — that is what the queue
    /// is for. The only error it can produce is the database write that parks
    /// one, and even that is the caller's to log rather than surface.
    ///
    /// # Errors
    ///
    /// Returns [`ScrobbleError::Queue`] when a failed play could not be parked.
    pub async fn submit_play(&self, pool: &SqlitePool, play: &ScrobblePlay) -> Result<()> {
        let settings = self.settings();
        let targets = active_targets(&settings, self.is_lastfm_configured());

        // Two cheap refusals before any work: nothing is connected, or the play
        // has nothing to attribute — a bare radio entry, typically.
        if targets.is_empty() || !play.is_submittable() {
            return Ok(());
        }

        let failed = self.submit(play, targets, &settings).await;
        if failed.is_empty() {
            return Ok(());
        }

        let parked = park(play, failed, now_ms());
        let mut conn = pool.acquire().await.map_err(queue_failure)?;
        scrobble_queue::enqueue(&mut conn, &parked).await?;
        Ok(())
    }

    /// Retry every parked scrobble that is due.
    ///
    /// # Errors
    ///
    /// Returns [`ScrobbleError::Queue`] when the queue cannot be read or
    /// written. A submission failure is not an error here; it reschedules.
    pub async fn flush(&self, pool: &SqlitePool) -> Result<()> {
        let settings = self.settings();
        // v1 checked this inside the flush rather than around the timer, so a
        // user who switches scrobbling off keeps their parked plays instead of
        // burning attempts on them.
        if !settings.enabled {
            return Ok(());
        }

        let now = now_ms();
        let due = {
            let mut conn = pool.acquire().await.map_err(queue_failure)?;
            scrobble_queue::due(&mut conn, now).await?
        };

        // Submissions happen with no connection held; see the module docs.
        let mut outcomes = Vec::with_capacity(due.len());
        for item in due {
            let play = play_of(&item);
            let failed = self.submit(&play, item.targets, &settings).await;
            outcomes.push((item.id, failed));
        }

        if outcomes.is_empty() {
            return Ok(());
        }

        let mut conn = pool.acquire().await.map_err(queue_failure)?;
        for (id, failed) in outcomes {
            if failed.is_empty() {
                scrobble_queue::remove(&mut conn, &id).await?;
            } else {
                scrobble_queue::mark_retried(&mut conn, &id, failed, now).await?;
            }
        }

        Ok(())
    }

    /// Submit `play` to `targets`, returning the ones that **failed**.
    ///
    /// Each backend is independent: one failing never aborts the other, which
    /// is why a play can end up parked owing only half of what it started with.
    async fn submit(
        &self,
        play: &ScrobblePlay,
        targets: ScrobbleTargets,
        settings: &ScrobbleSettings,
    ) -> ScrobbleTargets {
        let lastfm = async {
            if !targets.lastfm {
                return false;
            }
            match (&self.lastfm, settings.lastfm_session_key.as_deref()) {
                (Some(client), Some(session_key)) => {
                    report(client.submit(play, session_key).await, "last.fm")
                }
                // Credentials went away between the gate and here. v1 pushed
                // this onto the failed list rather than dropping the play, so a
                // reconnect later still lands it.
                _ => true,
            }
        };

        let listenbrainz = async {
            if !targets.listenbrainz {
                return false;
            }
            match settings.listen_brainz_token.as_deref() {
                Some(token) => report(self.listenbrainz.submit(play, token).await, "listenbrainz"),
                None => true,
            }
        };

        let (lastfm, listenbrainz) = futures::future::join(lastfm, listenbrainz).await;
        ScrobbleTargets {
            lastfm,
            listenbrainz,
        }
    }

    /// The stored settings, defaulted when absent or malformed.
    fn settings(&self) -> ScrobbleSettings {
        self.store.scrobble_settings()
    }

    /// Apply `mutate` to the stored settings and persist the result.
    ///
    /// A write failure is logged and swallowed, which is v1's behaviour: the
    /// settings file being unwritable is not something the scrobbling UI can
    /// act on, and failing the connect call would discard a session key that
    /// was just successfully negotiated.
    fn update_settings(&self, mutate: impl FnOnce(&mut ScrobbleSettings)) {
        let mut settings = self.settings();
        mutate(&mut settings);
        if let Err(error) = save(&self.store, &settings) {
            tracing::warn!(%error, "could not persist the scrobbling settings");
        }
    }

    async fn pending_count(&self, pool: &SqlitePool) -> Result<u32> {
        let mut conn = pool.acquire().await.map_err(queue_failure)?;
        Ok(scrobble_queue::count(&mut conn).await?)
    }
}

/// Unix milliseconds now.
///
/// Before the epoch is unrepresentable rather than negative: a machine whose
/// clock is set before 1970 would otherwise park every scrobble as due in the
/// far future.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

/// The row parked for a play that failed to submit.
///
/// The id is `md5(artist|track|startedAt)`, exactly as v1 derived it. That it is
/// content-derived is what makes re-parking the same play an update rather than
/// a duplicate now that it is a primary key.
pub fn park(play: &ScrobblePlay, failed: ScrobbleTargets, now: i64) -> QueuedScrobble {
    let mut hasher = Md5::new();
    hasher.update(format!("{}|{}|{}", play.artist, play.track, play.started_at).as_bytes());

    QueuedScrobble {
        id: format!("{:x}", hasher.finalize()),
        artist: play.artist.clone(),
        track: play.track.clone(),
        album: play.album.clone(),
        duration_seconds: play.whole_duration(),
        started_at: play.started_at,
        targets: failed,
        attempts: 0,
        // v1 set `nextAttemptAt: Date.now()`, so the first retry is whenever the
        // next flush tick comes round rather than a backoff away.
        next_attempt_at: now,
        enqueued_at: now,
    }
}

/// The play a parked row describes.
fn play_of(item: &QueuedScrobble) -> ScrobblePlay {
    ScrobblePlay {
        artist: item.artist.clone(),
        track: item.track.clone(),
        album: item.album.clone(),
        duration_seconds: item.duration_seconds.map(|seconds| seconds as f64),
        started_at: item.started_at,
    }
}

/// Log a submission failure and report whether it failed.
fn report(outcome: Result<()>, target: &'static str) -> bool {
    match outcome {
        Ok(()) => false,
        Err(error) => {
            tracing::warn!(%error, target, "scrobble submit failed; will retry");
            true
        }
    }
}

/// Acquiring the connection is a queue failure like any other.
fn queue_failure(source: sqlx::Error) -> ScrobbleError {
    ScrobbleError::Queue {
        source: shiranami_db::DbError::Query {
            operation: "acquire the database connection",
            source,
        },
    }
}
