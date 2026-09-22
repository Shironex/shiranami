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
    ///
    /// Behind a lock because `db:backup:import` **replaces** it: importing a
    /// library closes the live pool, swaps the file underneath it and opens a
    /// new one, which `shiranami_db::repo::backup` explicitly leaves to "the
    /// layer above" because it is file orchestration rather than SQL. v1 did
    /// the same thing with `closeDatabase()` / `initializeDatabase()`.
    ///
    /// A `std::sync::RwLock` rather than an async one, and that is safe here
    /// only because **the guard is never held across an `await`**: every reader
    /// clones the handle — `SqlitePool` is itself a cheap `Arc` — and drops the
    /// guard before doing anything asynchronous. See [`AppState::pool`].
    pool: std::sync::RwLock<SqlitePool>,

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

    /// The rest of `downloader:*` and all of `playlist:*`: the two binary
    /// managers, yt-dlp search, the playlist extractor, the single-URL download
    /// runner, and the one piece of cross-call state v1 kept in a module-level
    /// variable (the in-flight extraction's cancel token).
    ///
    /// Separate from `downloads` because the queue is one service among these
    /// and the kickoff typed it on its own; folding it in would rename a field
    /// six other lanes read.
    pub downloader: Option<Arc<crate::downloads::DownloaderServices>>,

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

    /// Auto-update, behind [`crate::seam::Updater`]. `tauri-plugin-updater` in
    /// Phase 16; absent in dev, on macOS until the Developer ID cert lands
    /// (§4.3), and under `SHIRANAMI_E2E=1`. An absent updater is what
    /// `updater:check-for-updates` answers `{ enabled: false }` for, which is
    /// exactly v1's answer in the same three cases.
    pub updater: Option<Arc<dyn crate::seam::Updater>>,
    /// Lyrics resolution across local files, embedded tags and LRCLIB.
    ///
    /// Here rather than beside [`AppState::weather`] — the other cache-holding
    /// service — for one reason: `LyricsService::new` takes an
    /// `Arc<dyn LyricsPolicy>`, and that policy answers "may a lyric file beside
    /// this path be read?" from the watched-folder set. The folders cache is
    /// built during boot, so the service cannot be constructed from
    /// [`AppState::from_parts`]'s already-finished pieces without inventing the
    /// boot order §2.8 owns.
    ///
    /// Constructed **once**, like the weather service and for the same reason:
    /// its LRU and its in-flight coalescing map are its entire memory, and a
    /// per-call service would re-request LRCLIB for every track change.
    pub lyrics: Option<Arc<shiranami_integrations::lyrics::LyricsService>>,

    /// YouTube search, over a `yt-dlp` the app may still be installing.
    ///
    /// Two consumers: the three `downloader:*` lookup channels, and this
    /// crate's share-payload assembly, which falls back to a search for any
    /// track `youtube_mappings` has never resolved. Deferred because
    /// `SearchService::new` needs the resolved path to the managed yt-dlp
    /// binary, which is a boot-time answer — the binary may not be on disk yet
    /// on a first run.
    pub search: Option<Arc<shiranami_downloader::search::SearchService>>,

    /// The discover shelf's yt-dlp fan-out, and the latch that coalesces it.
    ///
    /// Deferred for `search`'s reason — it needs the resolved path to the
    /// managed yt-dlp — and held rather than rebuilt per call for a second one:
    /// the latch is the state, and a per-call refresh would be two latches and
    /// therefore none. Absent under `SHIRANAMI_E2E=1`, where no external binary
    /// may run.
    pub discover: Option<Arc<crate::discover::DiscoverRefresh>>,
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
            pool: std::sync::RwLock::new(pool),
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
        // `pool()` clones the handle and releases the lock before this `await`,
        // which is what makes the synchronous lock sound. Inlining the read
        // guard here instead would hold it across the acquire and deadlock
        // against `replace_pool`.
        self.pool()
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
    ///
    /// Returns an owned handle rather than a reference: the pool can be
    /// replaced by an import, and a borrow would pin the lock for the caller's
    /// whole scope — including across the `await`s those background tasks are
    /// made of. `SqlitePool` is an `Arc` internally, so the clone is a refcount
    /// bump.
    ///
    /// A caller holding a handle across an import keeps the *old* pool alive
    /// and will keep querying the pre-import database. That is the correct
    /// reading of "the work already in flight finishes against the library it
    /// started on", and it is why [`Self::replace_pool`] closes the old pool
    /// rather than assuming nobody holds one.
    pub fn pool(&self) -> SqlitePool {
        self.pool
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// Swap in a pool over a different file, returning the one replaced.
    ///
    /// Only `db:backup:import` calls this. **Synchronous, and it returns the
    /// old pool rather than closing it**, for two reasons that point the same
    /// way:
    ///
    /// - `SqlitePool::close` waits for every checked-out connection to come
    ///   back. Awaiting that while holding the write guard would block every
    ///   other command's [`Self::pool`] read for the duration, and deadlock
    ///   outright if one of those commands is the holder being waited on.
    /// - An `async fn` here would put a `&AppState` borrow across an await in
    ///   its caller, and a generated command wrapper cannot prove that `Send`
    ///   for every lifetime its `State<'_>` could take. Handing the pool back
    ///   lets the caller close an **owned** value instead.
    ///
    /// (The attribute that generates those wrappers is deliberately not spelled
    /// out above: `lint:meta`'s `rust-command-placement` rule is a text scan, so
    /// naming it here would report this file as a misplaced command.)
    ///
    /// The lock is poisoned only if a thread panicked while holding it, which
    /// for a critical section this small means the process is already in
    /// trouble; recovering the guard is strictly better than refusing to
    /// install a pool the caller has already opened, since the alternative
    /// leaves the app pointing at a closed one.
    pub fn install_pool(&self, replacement: SqlitePool) -> SqlitePool {
        let mut guard = self
            .pool
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        std::mem::replace(&mut *guard, replacement)
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
        state_over_with(dir, Deferred::default()).await
    }

    /// The same state, with some of [`Deferred`] filled in.
    ///
    /// Every namespace whose channels reach a deferred piece needs this — the
    /// seams' recording doubles in [`crate::seam::fake`] are of no use if there
    /// is no way to put one into the state a command reads. Kept beside
    /// [`state_over`] rather than rebuilt per lane so all of them exercise one
    /// composition, which is the whole reason that fixture is shared.
    pub(crate) async fn state_over_with(dir: &Path, deferred: Deferred) -> AppState {
        let opened = shiranami_db::open(&dir.join("shiranami.db"))
            .await
            .expect("a fresh database must open");
        let (settings, _quarantined) = SettingsStore::load(dir.join("config.json"));
        let http = HttpClient::new().expect("the HTTP client must build");

        AppState::from_parts(opened.pool, Arc::new(settings), Arc::new(http), deferred)
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
        assert!(deferred.downloader.is_none());
        assert!(deferred.scrobbler.is_none());
        assert!(deferred.discord.is_none());
        assert!(deferred.media_controls.is_none());
        assert!(deferred.updater.is_none());
        assert!(deferred.lyrics.is_none());
        assert!(deferred.search.is_none());
    }
}
