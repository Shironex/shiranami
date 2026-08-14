//! §2.8's boot order, run.
//!
//! The sequence is split in two because Tauri splits it in two, and the seam is
//! not arbitrary: [`preflight`] is everything that must happen **before**
//! `tauri::Builder` exists, and [`finish`] is everything that needs an
//! `AppHandle`.
//!
//! Three things force work into `preflight`, and each would be a real bug the
//! other way round:
//!
//! 1. **`hydrate_login_path`** mutates the process environment, which is not
//!    thread-safe and must run while the process is still single-threaded (R19).
//! 2. **Sentry consent** has to be read before the `Builder` is constructed,
//!    because §2.8 step 3 requires *not registering the plugin at all* when
//!    consent is absent — and a plugin cannot be un-registered later.
//! 3. **Logging** comes first of all, because every line the two above want to
//!    write needs a subscriber, and a failure before it is invisible.
//!
//! Everything after that needs the app: the database lives under the path
//! resolver's directory, the serve config needs the folders cache, and the
//! window is the app's.
//!
//! # Refusing to start is a real outcome
//!
//! [`BootError`] exists because §3.1 step 7 is explicit about the failure mode
//! that must never happen: *"On any failure: refuse to start with a clear,
//! actionable error. Never 'helpfully' continue into a fresh empty DB — that is
//! the 'where did my library go?' failure mode."* Phase 17 owns the data
//! continuity that makes that concrete; this phase establishes that a failed
//! database open aborts `setup()` rather than being logged and stepped over.

use std::path::PathBuf;
use std::sync::Arc;

use shiranami_core::migrate::MigrateError;
use shiranami_core::paths::FoldersCache;
use shiranami_core::store::SettingsStore;
use tauri::{AppHandle, Manager as _};

use crate::boot::services::{self, Ingredients};
use crate::boot::timer::{BootTimer, Stage};
use crate::folders::{Folders, LiveAuthority};
use crate::infra::{logging, platform, sentry};
use crate::state::AppState;

/// What went wrong badly enough to refuse a launch.
#[derive(Debug, thiserror::Error)]
pub enum BootError {
    /// The app data directory could not be resolved or created. Nothing below
    /// can proceed: the database, the settings and the caches all hang off it.
    #[error("could not resolve the application data directory")]
    NoDataDirectory,

    /// The library could not be opened, adopted or migrated.
    #[error("could not open the music library: {0}")]
    Database(#[from] shiranami_db::DbError),

    /// The v1 library could not be copied into the v2 directory (§3.1).
    ///
    /// The most important variant in this enum, and the only one whose absence
    /// would be a *silent* fault: continuing past a failed migration means
    /// opening a fresh empty database beside a v1 tree full of the user's
    /// music, which is R6 and is the failure §3.1 step 7 exists to forbid —
    /// *"never 'helpfully' continue into a fresh empty DB — that is the 'where
    /// did my library go?' failure mode"*.
    ///
    /// Carries a rendered string for the same reason [`BootError::Serve`] does:
    /// the message is what the refusal dialog shows, and it already names the
    /// path and the underlying reason.
    #[error("could not bring your library across from the previous version: {0}")]
    Continuity(String),

    /// The loopback server could not bind, or its HTTP client could not build.
    /// Fatal rather than degraded: with no server there is no audio and no
    /// album art, so an app that started anyway would look comprehensively
    /// broken with nothing to explain it.
    ///
    /// Carries a rendered string rather than the source error because the two
    /// failures it covers come from different crates and neither is actionable
    /// beyond its own message.
    #[error("could not start the local media server: {0}")]
    Serve(String),
}

/// What `finish` hands back for `run()` to install.
pub struct Booted {
    /// The managed state every command reaches through.
    pub state: AppState,
    /// The folders cache and its authority, for the invalidation hooks.
    pub folders: Arc<Folders>,
    /// The concrete services `crate::boot::reconcile` drives. See
    /// [`services::Handles`] for why these are not in `Deferred`.
    pub handles: services::Handles,
}

/// Everything built before `tauri::Builder`.
pub struct Preflight {
    /// The app data directory, resolved without the app.
    pub data_dir: PathBuf,
    /// The settings store, already readable.
    pub settings: Arc<SettingsStore>,
    /// What first-run continuity did, or why it could not (§3.1).
    ///
    /// Held rather than acted on because [`preflight`] has no way to refuse a
    /// launch: it runs before `tauri::Builder` exists, so there is no window to
    /// put a dialog on. [`finish`] turns an error here into
    /// [`BootError::Continuity`] **before** anything opens the database, which
    /// is the ordering step 7 actually requires.
    pub continuity: std::result::Result<shiranami_core::migrate::Outcome, MigrateError>,
    /// The script that re-seeds the renderer's `localStorage` from the v1
    /// bridge's dump (§3.5), when there is anything to seed.
    pub renderer_seed: Option<String>,
    /// Keeps the file appender's worker alive; see [`logging::LogGuard`].
    pub logging: logging::LogGuard,
    /// `Some` only when consent, packaging and a DSN all agree. Its presence is
    /// what tells `run()` whether to register the plugin.
    pub sentry: Option<sentry::SentryGuard>,
    /// Stamped through both halves of boot.
    pub timer: BootTimer,
    /// Whether this is an E2E run (§2.8 step 7).
    pub e2e: bool,
}

/// Steps 1 to 3: PATH, logging, settings, consent.
///
/// Infallible by construction. A data directory that cannot be resolved is
/// reported by [`finish`] instead, because refusing to launch is a decision that
/// wants a subscriber installed to explain itself — and at this point there
/// might not be one.
pub fn preflight() -> Preflight {
    // Before anything spawns and before the runtime exists (R19).
    platform::hydrate_login_path();

    let data_dir = shiranami_core::paths::data_dir().unwrap_or_else(|| {
        // A placeholder rather than a panic: `finish` turns the same condition
        // into `BootError::NoDataDirectory`, where there is a logger to say so.
        PathBuf::from(shiranami_core::paths::V2_DIRECTORY_NAME)
    });

    let mut timer = BootTimer::start();

    let logging = logging::install(&data_dir.join(crate::paths::LOGS_DIRECTORY_NAME));
    timer.stage(Stage::Logging);

    let e2e = platform::is_e2e();
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        os = std::env::consts::OS,
        arch = std::env::consts::ARCH,
        data_dir = %data_dir.display(),
        e2e,
        "shiranami starting"
    );

    // ── first-run data continuity (§3.1) ────────────────────────────────────
    //
    // Before the settings store, not after it as §2.8's list reads: this is the
    // step that *puts* `config.json` in the v2 directory, so loading first
    // would read an empty document on exactly the launch where a returning
    // user's preferences matter. See `Stage::Continuity`.
    //
    // A failure is carried rather than thrown — there is no window to explain
    // it on yet — and `finish` refuses the launch before the database opens.
    let continuity = shiranami_core::migrate::run(
        shiranami_core::paths::legacy_data_dir().as_deref(),
        &data_dir,
    );
    match &continuity {
        Ok(outcome) => tracing::info!(?outcome, "first-run data continuity"),
        Err(error) => tracing::error!(%error, "first-run data continuity failed"),
    }
    let renderer_seed = continuity
        .as_ref()
        .ok()
        .and_then(|outcome| crate::window::renderer_seed_script(&data_dir, outcome));
    timer.stage(Stage::Continuity);

    let (settings, quarantined) =
        SettingsStore::load(data_dir.join(shiranami_core::paths::SETTINGS_FILE));
    if let Some(path) = quarantined {
        // The settings file was unparsable and has been moved aside rather than
        // overwritten with defaults — D17's whole reason for not using
        // `tauri-plugin-store`. Worth a warning: the user's preferences are gone
        // and the bytes are recoverable from this path.
        tracing::warn!(path = %path.display(), "quarantined an unreadable settings file");
    }
    let settings = Arc::new(settings);
    timer.stage(Stage::Settings);

    // Read consent and initialise *before* the builder exists (§2.8 step 3).
    let sentry = sentry::init(&settings);
    sentry::watch_consent(&settings);

    Preflight {
        data_dir,
        settings,
        continuity,
        renderer_seed,
        logging,
        sentry,
        timer,
        e2e,
    }
}

/// Steps 5 and 6: database, folders cache, server, services.
///
/// Called from `setup()`, which owns the `AppHandle`. Returns the managed state
/// for the caller to install, plus the folders handle the invalidation hooks
/// need.
///
/// # Errors
///
/// [`BootError`] for anything that makes a usable app impossible. The caller
/// aborts `setup()` rather than continuing — see the module docs.
pub async fn finish(app: &AppHandle, preflight: &mut Preflight) -> Result<Booted, BootError> {
    // Tauri's resolver is the authority; core's copy exists so the settings
    // store can resolve a path without an app, and the two must not disagree.
    let data_dir = app
        .path()
        .app_data_dir()
        .ok()
        .or_else(shiranami_core::paths::data_dir)
        .ok_or(BootError::NoDataDirectory)?;

    std::fs::create_dir_all(&data_dir).map_err(|_| BootError::NoDataDirectory)?;

    // ── first-run continuity's verdict (§3.1 step 7) ────────────────────────
    //
    // Checked *before* the open below, and that ordering is the whole point: a
    // migration that failed leaves a v1 tree full of music beside an empty v2
    // directory, and `shiranami_db::open` would happily create a fresh database
    // there. The user would launch into an empty library with their music still
    // on disk and nothing to say so.
    if let Err(error) = &preflight.continuity {
        return Err(BootError::Continuity(error.to_string()));
    }

    // ── the database ────────────────────────────────────────────────────────
    let opened = shiranami_db::open(&data_dir.join("shiranami.db")).await?;
    tracing::info!(adoption = ?opened.adoption, "library opened");
    preflight.timer.stage(Stage::Database);

    // `shiranami-net` is the only constructor of a reqwest client
    // workspace-wide, so its rate gates and its SSRF guard cannot be bypassed.
    let http = Arc::new(
        shiranami_net::HttpClient::new().map_err(|error| BootError::Serve(error.to_string()))?,
    );

    let music_dir = app
        .path()
        .audio_dir()
        .unwrap_or_else(|_| data_dir.join("Music"));

    // ── the folders cache ───────────────────────────────────────────────────
    let authority = LiveAuthority::new(
        Arc::clone(&preflight.settings),
        music_dir.clone(),
        opened.pool.clone(),
    );
    authority.refresh_roots(&opened.pool).await;

    let cache = Arc::new(FoldersCache::new(
        data_dir.clone(),
        Arc::clone(&authority) as Arc<dyn shiranami_core::paths::PathAuthority>,
    ));
    // v1 prewarmed at boot so the first user-triggered request did not pay for
    // it; the cache's own docs name this call as boot's.
    cache.prewarm();
    let folders = Arc::new(Folders {
        cache: Arc::clone(&cache),
        authority,
    });
    preflight.timer.stage(Stage::FoldersCache);

    // ── the loopback server ─────────────────────────────────────────────────
    // Bound once and shared: the OS media surface resolves the cover URLs this
    // server hands out back into the files under it, so the two reading a
    // different directory would silently cost every now-playing thumbnail.
    let art_dir = shiranami_metadata::art::art_dir(&data_dir);
    let mut serve_config = shiranami_serve::ServeConfig::new(
        Arc::clone(&cache),
        art_dir.clone(),
        shiranami_metadata::background::background_dir(&data_dir),
        (*http).clone(),
    );
    // The radio proxy de-frames ICY metadata but has no `AppHandle` to announce
    // it with (§2.1: the crates never reach for the composition root), so the
    // crossing is a callback the composition root supplies. It runs on the task
    // polling the station's body, which is why it only emits — anything slower
    // here is latency in front of the audio the user is hearing.
    let now_playing_app = app.clone();
    serve_config.now_playing = shiranami_serve::NowPlayingSink::from_fn(move |playing| {
        use tauri_specta::Event as _;
        // A failed emit means the window is gone, which is not worth a log line
        // once per song for the rest of the session.
        let _ = crate::events::RadioNowPlayingChanged(playing).emit(&now_playing_app);
    });
    let serve = shiranami_serve::start(serve_config)
        .await
        .map_err(|error| BootError::Serve(error.to_string()))?;
    tracing::info!(
        port = serve.port(),
        "the loopback media server is listening"
    );
    preflight.timer.stage(Stage::Serve);

    // ── the deferred services ───────────────────────────────────────────────
    let (mut deferred, handles) = services::build(&Ingredients {
        app: app.clone(),
        pool: opened.pool.clone(),
        settings: Arc::clone(&preflight.settings),
        http: Arc::clone(&http),
        folders: Arc::clone(&cache),
        data_dir: data_dir.clone(),
        music_dir,
        e2e: preflight.e2e,
    });
    deferred.serve = Some(Arc::new(serve));
    deferred.updater = crate::updater::build(app, preflight.e2e);

    // The OS media surface is built here rather than in `services` because it
    // needs the **window** — on Windows, its raw `HWND` — and because its
    // backend is not `Send`, so it has to be constructed on the thread that
    // owns the handle. The window already exists: Tauri creates the ones
    // `tauri.conf.json` declares before `setup()` runs, which is what makes
    // this possible inside the same stage rather than after it.
    deferred.media_controls = app
        .get_webview_window("main")
        .and_then(|window| crate::media::build(app, &window, preflight.e2e, art_dir));

    let state = AppState::from_parts(opened.pool, Arc::clone(&preflight.settings), http, deferred);
    preflight.timer.stage(Stage::Services);

    Ok(Booted {
        state,
        folders,
        handles,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every variant refuses a launch and none is a state the app can carry on
    /// in. Asserted on the rendering because these messages are what a user sees
    /// when the app declines to start — §3.1 step 7's "clear, actionable error".
    #[test]
    fn every_boot_failure_names_what_could_not_be_done() {
        let no_dir = BootError::NoDataDirectory.to_string();
        assert!(no_dir.contains("data directory"), "{no_dir}");

        let database = BootError::Database(shiranami_db::DbError::Query {
            operation: "acquire the database connection",
            source: sqlx::Error::PoolClosed,
        })
        .to_string();
        assert!(database.contains("music library"), "{database}");

        let serve = BootError::Serve("address in use".to_owned()).to_string();
        assert!(serve.contains("media server"), "{serve}");
        assert!(
            serve.contains("address in use"),
            "the underlying reason has to survive: {serve}"
        );
    }

    /// The split between the two halves does not reorder anything: preflight
    /// stamps §2.8's first three stages and `finish` stamps the rest, in the
    /// same sequence `boot::timer` pins.
    #[test]
    fn the_preflight_stages_are_the_first_three_of_section_2_8() {
        assert_eq!(
            &Stage::EXPECTED_ORDER[..3],
            &[Stage::Logging, Stage::Continuity, Stage::Settings]
        );
    }

    #[test]
    fn the_setup_stages_are_the_remaining_five() {
        assert_eq!(
            &Stage::EXPECTED_ORDER[3..],
            &[
                Stage::Database,
                Stage::FoldersCache,
                Stage::Serve,
                Stage::Services,
                Stage::Window,
            ]
        );
    }

    /// The ordering §3.1 depends on and §2.8 does not state: the v1 tree is
    /// copied before the settings store reads `config.json`, because the copy is
    /// what puts that file there.
    #[test]
    fn continuity_runs_before_the_settings_store_loads() {
        let order = Stage::EXPECTED_ORDER;
        let continuity = order.iter().position(|s| *s == Stage::Continuity);
        let settings = order.iter().position(|s| *s == Stage::Settings);

        assert!(
            continuity < settings,
            "the settings file arrives *from* the migration; loading first reads an empty document"
        );
    }

    /// …and before the database is opened, which is the one that loses a
    /// library (R6). `finish` returns `BootError::Continuity` above the `open`
    /// call; this pins the vocabulary that makes the ordering readable.
    #[test]
    fn continuity_runs_before_the_database_opens() {
        let order = Stage::EXPECTED_ORDER;
        assert!(
            order.iter().position(|s| *s == Stage::Continuity)
                < order.iter().position(|s| *s == Stage::Database)
        );
    }

    /// §3.1 step 7's message, as a user reads it. It has to name the previous
    /// version — "could not copy a file" with no context does not tell someone
    /// that their library is safe and still where they left it.
    #[test]
    fn a_failed_migration_refuses_the_launch_and_says_what_failed() {
        let rendered = BootError::Continuity(
            "could not copy /v1/shiranami.db to /v2/shiranami.db: no space left on device"
                .to_owned(),
        )
        .to_string();

        assert!(rendered.contains("previous version"), "{rendered}");
        assert!(rendered.contains("no space left on device"), "{rendered}");
    }
}
