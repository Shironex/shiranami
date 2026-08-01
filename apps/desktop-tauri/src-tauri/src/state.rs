//! The managed state every command reaches through.
//!
//! One `app.manage(AppState)` and nothing else. Architecture §2.3 forbids
//! globals outright, so a command that needs the database, the settings file,
//! an HTTP client or a service takes `State<'_, AppState>` and reads it from
//! here — there is no other way to get at any of them.
//!
//! # This file is a record, not a boot sequence
//!
//! Everything below is already-constructed. `AppState` has no `new()` that opens
//! a database or starts a server, because **boot order is load-bearing and is
//! Phase 16's** (§2.8): the single-instance plugin has to be registered before
//! two processes can race `shiranami.db`, the settings file has to be readable
//! before Sentry consent can be checked, the first-run data continuity pass has
//! to finish before the database is opened for writing, and the stream server's
//! port is not known until it binds. A constructor here that did any of that
//! would be a second, competing definition of that order.
//!
//! So [`AppState::from_parts`] takes finished pieces and stores them. Phase 16's
//! `setup()` builds them in the documented order and hands them over; the test
//! helper below builds the subset a test needs, which is what lets a command be
//! exercised against a real temporary database with no webview.
//!
//! # The single connection
//!
//! `shiranami-db`'s pool holds exactly one connection (Phase 6), and
//! `shiranami_db::repo` states the convention that follows: **every repository
//! function takes `&mut SqliteConnection` and none of them acquires; the command
//! layer acquires once at its boundary and passes `&mut *conn` down**. A command
//! that acquired twice would not fail, it would hang forever waiting for a
//! connection only it holds. [`AppState::conn`] is this crate's one acquire
//! site, for the same reason `repo::conn::acquire` is the crate's one acquire
//! site down there: "does anything acquire twice?" should be answerable by
//! grepping, not by reading every command.
//!
//! It also means **no command may await the network while holding a
//! connection.** A ten-second HTTP timeout with the connection in hand stalls
//! every query in the app. Acquire late, release early — the rule the Phase 12
//! scrobbler already follows for its background flush.

use std::sync::Arc;

use shiranami_core::store::SettingsStore;
use shiranami_integrations::weather::WeatherService;
use shiranami_net::HttpClient;
use sqlx::pool::PoolConnection;
use sqlx::{Sqlite, SqlitePool};

use crate::error::{CommandResult, WireResultExt as _};

/// Everything the command surface can reach.
///
/// Cheap to clone conceptually — Tauri hands out `State<'_, AppState>` by
/// reference and every field is either an `Arc` or already internally shared
/// (`SqlitePool` and `HttpClient` are both handle types).
pub struct AppState {
    /// The database pool. One connection; see the module docs.
    pool: SqlitePool,

    /// The atomic JSON settings store, with its renderer-writable key allowlist
    /// and its change bus (decision D17 — deliberately not `tauri-plugin-store`,
    /// because this file holds secrets and needs `create_owner_only` 0600 at
    /// creation, `quarantine_corrupt` before any defaults fallback, and a
    /// Rust-side watcher for the consent → Sentry and launch-at-startup → login
    /// item gates).
    settings: Arc<SettingsStore>,

    /// The one `reqwest` client in the process. `shiranami-net` is the sole
    /// constructor of one workspace-wide, so its per-host rate gates and its
    /// SSRF guard cannot be bypassed by a second client appearing somewhere.
    http: Arc<HttpClient>,

    /// Keyless Open-Meteo, holding the forecast and geocode caches. Constructed
    /// once because those caches are its entire memory: a per-call service would
    /// re-fetch every tile and re-geocode every query.
    weather: Arc<WeatherService>,

    /// The pieces Phase 16 boots and later lanes consume.
    deferred: Deferred,
}

/// State the shell owns but no command in this phase reads yet.
///
/// Named and typed here rather than left to each fan-out lane to invent,
/// because the charter in §2.1 is what these are: the shell composes them, the
/// crates implement them. `Option` is honest about the phase — a
/// `SHIRANAMI_E2E=1` run deliberately has no Discord and no media controls
/// (§2.8 step 7), so "absent" is a real runtime state and not just a
/// placeholder for unfinished work.
#[derive(Default)]
pub struct Deferred {
    /// The loopback byte server: audio ranges, album art, the radio proxy. The
    /// webview needs its base URL and session token, which
    /// `serve:get-base-url`-shaped commands will read from here. Phase 16 starts
    /// it in `setup()` and shuts it down on `ExitRequested`.
    pub serve: Option<Arc<shiranami_serve::ServeHandle>>,

    /// The download queue's async driver — concurrency 3, pause/resume, batches,
    /// write-through to `download_queue`. Its state machine is pure and its
    /// effects are performed by this driver, which is why the shell holds the
    /// driver and not the machine.
    pub downloads: Option<Arc<shiranami_downloader::queue::DownloadQueue>>,

    /// Last.fm and ListenBrainz submission plus the persisted retry queue. The
    /// flush timer belongs to the composition root, not to the crate.
    pub scrobbler: Option<Arc<shiranami_integrations::scrobble::Scrobbler>>,

    /// Discord Rich Presence, behind [`crate::seam::Presence`]. Its `pump` is
    /// driven from the shell too: the crate returns a state machine and the
    /// composition root owns the clock that advances it.
    pub discord: Option<Arc<dyn crate::seam::Presence>>,

    /// The OS media surface, behind [`crate::seam::MediaControls`] — SMTC on
    /// Windows, `MPNowPlayingInfoCenter` on macOS. A seam rather than the
    /// concrete `MediaControlsService<B>` because picking `B` is a boot decision
    /// (see `crate::seam`), and because `SHIRANAMI_E2E=1` runs with no OS
    /// integration at all.
    pub media_controls: Option<Arc<dyn crate::seam::MediaControls>>,
}

impl AppState {
    /// Store already-built pieces. See the module docs for why there is no
    /// constructor that builds them.
    pub fn from_parts(
        pool: SqlitePool,
        settings: Arc<SettingsStore>,
        http: Arc<HttpClient>,
        deferred: Deferred,
    ) -> Self {
        let weather = Arc::new(WeatherService::new((*http).clone()));
        Self {
            pool,
            settings,
            http,
            weather,
            deferred,
        }
    }

    /// Take the pool's one connection for the duration of one command.
    ///
    /// **This crate's only acquire site.** Call it once, pass `&mut *conn` to
    /// every repository the command needs, and let it drop on return. Never call
    /// it twice in one command and never hold the result across a network await;
    /// see the module docs for what each of those costs.
    pub async fn conn(&self) -> CommandResult<PoolConnection<Sqlite>> {
        self.pool
            .acquire()
            .await
            .map_err(|source| shiranami_db::DbError::Query {
                operation: "acquire the database connection",
                source,
            })
            .wire()
    }

    /// The pool itself, for the background tasks that own their own acquisition
    /// discipline (the scrobbler's flush, the queue's write-through).
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    /// The settings store.
    ///
    /// Returns the `Arc` rather than a plain reference because a command that
    /// writes has to move an owned handle into `spawn_blocking` — the atomic
    /// write is real disk I/O and must not run on the webview's thread.
    pub fn settings(&self) -> &Arc<SettingsStore> {
        &self.settings
    }

    /// The shared HTTP client.
    pub fn http(&self) -> &HttpClient {
        &self.http
    }

    /// The weather service, with its caches.
    pub fn weather(&self) -> &WeatherService {
        &self.weather
    }

    /// The pieces Phase 16 boots.
    pub fn deferred(&self) -> &Deferred {
        &self.deferred
    }
}

#[cfg(test)]
pub(crate) mod tests {
    //! Also the crate's shared test fixture: [`state_over`] is what every
    //! namespace's tests build their `AppState` with, so all of them exercise
    //! the same composition rather than each inventing a narrower one.

    use super::*;
    use shiranami_db::repo;
    use std::path::Path;

    /// A state over a real temporary database and a real temporary settings
    /// file.
    ///
    /// Deliberately the *real* composition rather than a mock: the reference
    /// namespaces exist to prove the acquire-once convention survives contact
    /// with commands, and a fake pool has no single connection to deadlock
    /// against. `shiranami_db::open` is the app's own boot path, so the schema
    /// under test is the one the baseline migration produces.
    pub(crate) async fn state_over(dir: &Path) -> AppState {
        let opened = shiranami_db::open(&dir.join("shiranami.db"))
            .await
            .expect("a fresh database must open");
        let (settings, _quarantined) = SettingsStore::load(dir.join("config.json"));
        let http = HttpClient::new().expect("the HTTP client must build");

        AppState::from_parts(
            opened.pool,
            Arc::new(settings),
            Arc::new(http),
            Deferred::default(),
        )
    }

    #[tokio::test]
    async fn a_command_can_acquire_the_connection_and_release_it() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        // Two sequential acquisitions stand in for two commands running back to
        // back. This is the shape that must work; two *concurrent* ones in one
        // command is the shape that hangs, which is why `conn` is the only
        // acquire site and why this crate has no second one to grep for.
        {
            let mut conn = state.conn().await.expect("first acquire");
            repo::tracks::get_all(&mut conn)
                .await
                .expect("a query runs");
        }
        {
            let mut conn = state.conn().await.expect("second acquire");
            repo::tracks::get_all(&mut conn)
                .await
                .expect("a query runs");
        }
    }

    #[tokio::test]
    async fn the_deferred_pieces_start_absent() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let deferred = state.deferred();
        assert!(deferred.serve.is_none());
        assert!(deferred.downloads.is_none());
        assert!(deferred.scrobbler.is_none());
        assert!(deferred.discord.is_none());
        assert!(deferred.media_controls.is_none());
    }
}
