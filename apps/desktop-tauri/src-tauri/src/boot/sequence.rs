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

    // ── the database ────────────────────────────────────────────────────────
    //
    // Phase 17's first-run continuity goes *here*, between the directory and
    // this call: it has to copy the v1 tree before anything opens the file for
    // writing.
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
    let serve = shiranami_serve::start(shiranami_serve::ServeConfig::new(
        Arc::clone(&cache),
        shiranami_metadata::art::art_dir(&data_dir),
        (*http).clone(),
    ))
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
    /// stamps §2.8's first two stages and `finish` stamps the rest, in the same
    /// sequence `boot::timer` pins.
    #[test]
    fn the_preflight_stages_are_the_first_two_of_section_2_8() {
        assert_eq!(
            &Stage::EXPECTED_ORDER[..2],
            &[Stage::Logging, Stage::Settings]
        );
    }

    #[test]
    fn the_setup_stages_are_the_remaining_five() {
        assert_eq!(
            &Stage::EXPECTED_ORDER[2..],
            &[
                Stage::Database,
                Stage::FoldersCache,
                Stage::Serve,
                Stage::Services,
                Stage::Window,
            ]
        );
    }
}
