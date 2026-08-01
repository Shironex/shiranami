//! Constructing every piece of [`crate::state::Deferred`].
//!
//! `state.rs` names these and says why none of them can be built by
//! `AppState::from_parts`: each needs something only boot has — a bound port, a
//! resolved binary path, a folders cache, an `AppHandle` to emit through. This
//! module is where each of those arrives.
//!
//! # `SHIRANAMI_E2E=1` is a real configuration, not a stub
//!
//! §2.8 step 7 turns off the tray, Discord, the updater and media controls under
//! the harness, and v1 gated the scrobbler and the recommendation refresh in the
//! same block. Every one of those is an `Option` in `Deferred` for that reason,
//! and the commands behind them already answer for an absent piece — an absent
//! updater reports `{ enabled: false }`, an absent presence falls back to a
//! plain store write. So the E2E path here is "do not construct it", never "wire
//! a fake".

use std::path::PathBuf;
use std::sync::Arc;

use shiranami_core::models::SHIRANAMI_DISCORD_CLIENT_ID;
use shiranami_core::notice::NoticeGate;
use shiranami_core::paths::FoldersCache;
use shiranami_core::store::SettingsStore;
use shiranami_downloader::bin::{Platform, bin_dir};
use shiranami_downloader::queue::{DownloadQueue, SqlitePersistence};
use shiranami_downloader::search::SearchService;
use shiranami_downloader::spawn::TokioRunner;
use shiranami_integrations::discord::{DiscordIpcSocket, DiscordPresence};
use shiranami_integrations::lyrics::{LrclibClient, LyricsPolicy, LyricsService};
use shiranami_integrations::scrobble::{LastfmCredentials, Scrobbler};
use shiranami_net::HttpClient;
use sqlx::SqlitePool;
use tauri::AppHandle;

use crate::commands::system::EventNoticeSink;
use crate::downloads::{
    DownloaderServices, QueueEvents, SettingsDownloadDirectory, SettingsPausedFlag,
};
use crate::state::Deferred;

/// Everything boot has already built that a deferred service might need.
pub struct Ingredients {
    /// The app handle every event sink emits through.
    pub app: AppHandle,
    /// The open library.
    pub pool: SqlitePool,
    /// The settings store.
    pub settings: Arc<SettingsStore>,
    /// The one HTTP client.
    pub http: Arc<HttpClient>,
    /// The long-lived containment guard, for the lyrics policy.
    pub folders: Arc<FoldersCache>,
    /// The app data directory — `bin/` and the art cache hang off it.
    pub data_dir: PathBuf,
    /// The OS music directory, for the download-location default.
    pub music_dir: PathBuf,
    /// Whether this is an E2E run. See the module docs.
    pub e2e: bool,
}

/// Build every deferred service except the serve handle, which boot starts
/// itself because the folders cache it needs is a boot artefact too.
pub fn build(ingredients: &Ingredients) -> Deferred {
    let processes = Arc::new(TokioRunner::new());
    let bin = bin_dir(&ingredients.data_dir);

    let downloader = Arc::new(DownloaderServices::new(
        Arc::clone(&processes) as Arc<dyn shiranami_downloader::spawn::ProcessRunner>,
        Arc::clone(&ingredients.http),
        bin.clone(),
        Platform::HOST,
    ));

    // A second `SearchService` over the same three handles rather than a
    // borrow of the one inside `DownloaderServices`. They are stateless — a
    // process runner, an HTTP client and a path — and the alternative is
    // widening `DownloaderServices` to hand out an `Arc` of its own field,
    // which would make a service that is currently private to it part of its
    // contract. `Deferred.search` exists because share-payload assembly needs
    // one without going through the downloader namespace.
    let search = Arc::new(SearchService::new(
        Arc::clone(&processes) as Arc<dyn shiranami_downloader::spawn::ProcessRunner>,
        Arc::clone(&ingredients.http),
        shiranami_downloader::bin::layout::yt_dlp_path(&bin, Platform::HOST),
    ));

    let downloads = build_queue(ingredients, &processes, &bin);

    Deferred {
        // Started by `boot::sequence`; see the doc above.
        serve: None,
        downloads: Some(downloads),
        downloader: Some(downloader),
        scrobbler: build_scrobbler(ingredients.e2e, &ingredients.settings, &ingredients.http),
        discord: build_discord(ingredients),
        // Both are OS surfaces and both are boot decisions of their own.
        media_controls: None,
        updater: None,
        lyrics: Some(build_lyrics(
            &ingredients.folders,
            &ingredients.settings,
            &ingredients.http,
        )),
        search: Some(search),
    }
}

/// The download queue, with its four real collaborators.
///
/// `shiranami-downloader` ships `NoSink`, `NoPersistence`, `NoPausedFlag` and
/// `NoProgress` and no production implementation of any of them, which is what
/// `crate::downloads` exists to supply. This is where the four meet.
fn build_queue(
    ingredients: &Ingredients,
    processes: &Arc<TokioRunner>,
    bin: &std::path::Path,
) -> Arc<DownloadQueue> {
    let paused = Arc::new(SettingsPausedFlag::new(Arc::clone(&ingredients.settings)));

    let persistence = Arc::new(SqlitePersistence::new(
        ingredients.pool.clone(),
        Arc::clone(&paused) as Arc<dyn shiranami_downloader::queue::PausedFlag>,
    ));

    let runner = Arc::new(shiranami_downloader::download::YtDlpDownloader::new(
        Arc::clone(processes) as Arc<dyn shiranami_downloader::spawn::ProcessRunner>,
        shiranami_downloader::bin::layout::yt_dlp_path(bin, Platform::HOST),
        shiranami_downloader::spawn::FfmpegAvailability::Managed(bin.to_path_buf()),
    ));

    let directory = Arc::new(SettingsDownloadDirectory::new(
        Arc::clone(&ingredients.settings),
        ingredients.music_dir.clone(),
    ));

    DownloadQueue::new(
        persistence,
        runner,
        Arc::new(QueueEvents::new(ingredients.app.clone())),
        directory,
    )
}

/// The scrobbler, or `None` under the harness.
///
/// Present even when Last.fm has no compiled-in credential: ListenBrainz needs
/// no application key, so a build without a Last.fm key still scrobbles to the
/// service the user configured. `Scrobbler::is_lastfm_configured` is what the
/// settings pane reads to decide whether to offer the Last.fm half.
fn build_scrobbler(
    e2e: bool,
    settings: &Arc<SettingsStore>,
    http: &HttpClient,
) -> Option<Arc<Scrobbler>> {
    if e2e {
        return None;
    }

    Some(Arc::new(Scrobbler::new(
        Arc::clone(settings),
        http.clone(),
        LastfmCredentials::from_build_env(),
    )))
}

/// Discord Rich Presence, behind the seam.
fn build_discord(ingredients: &Ingredients) -> Option<Arc<dyn crate::seam::Presence>> {
    if ingredients.e2e {
        return None;
    }

    let notices = Arc::new(NoticeGate::new(EventNoticeSink::new(
        ingredients.app.clone(),
    )));

    // Wrapped in the seam adapter rather than handed over raw: the crate's two
    // presence calls are synchronous and the seam's are not, and `crate::adapters`
    // is where that difference is reconciled once.
    Some(Arc::new(crate::adapters::DiscordAdapter::new(Arc::new(
        DiscordPresence::new(
            Arc::clone(&ingredients.settings),
            DiscordIpcSocket::new(SHIRANAMI_DISCORD_CLIENT_ID),
            notices,
        ),
    ))))
}

/// Lyrics, over the folders cache.
///
/// The reason this one is deferred at all: `LyricsService::new` takes an
/// `Arc<dyn LyricsPolicy>` whose containment answer comes from the watched-folder
/// set, so it cannot exist before the folders cache does.
fn build_lyrics(
    folders: &Arc<FoldersCache>,
    settings: &Arc<SettingsStore>,
    http: &HttpClient,
) -> Arc<LyricsService> {
    let policy = Arc::new(CachePolicy {
        folders: Arc::clone(folders),
        settings: Arc::clone(settings),
    });

    Arc::new(LyricsService::new(LrclibClient::new(http.clone()), policy))
}

/// The two app-level facts the lyrics ladder consults, answered from the two
/// places that own them.
struct CachePolicy {
    folders: Arc<FoldersCache>,
    settings: Arc<SettingsStore>,
}

impl LyricsPolicy for CachePolicy {
    fn is_local_resolution_allowed(&self, path: &std::path::Path) -> bool {
        // The same guard the audio route calls, deliberately: a lyric file is
        // read from beside a track, so "may this track's directory be read?" is
        // the identical question and a second answer to it would be a second
        // security boundary to keep in agreement.
        self.folders.is_path_allowed(path)
    }

    fn prefer_synced_from_lrclib(&self) -> bool {
        // Read per fetch rather than captured, as the trait requires: toggling
        // the preference has to take effect on the next track, not the next
        // launch.
        self.settings
            .get(shiranami_core::store::RendererStoreKey::LyricsPreferSyncedFromLrclib)
            == Some(serde_json::Value::Bool(true))
    }
}

#[cfg(test)]
mod tests {
    //! Three of the four builders take only what they need — a settings store, a
    //! folders cache, an HTTP client — so they are exercised here directly.
    //!
    //! `build` itself and `build_discord` are not, and the reason is worth
    //! stating rather than leaving as a gap: every event sink in
    //! `crate::downloads::sinks` takes a concrete `AppHandle<Wry>`, so an
    //! `Ingredients` cannot be built over `tauri::test::mock_app`'s
    //! `MockRuntime` without making the whole sink layer generic — a change to
    //! five Phase 14 files for one assertion. What that costs is covered by the
    //! runtime verification in the phase's report, where `build` runs for real.

    use super::*;

    struct Fixture {
        _dir: tempfile::TempDir,
        settings: Arc<SettingsStore>,
        http: Arc<HttpClient>,
        folders: Arc<FoldersCache>,
    }

    async fn fixture() -> Fixture {
        let dir = tempfile::tempdir().expect("a temp dir");
        let pool = shiranami_db::open(&dir.path().join("shiranami.db"))
            .await
            .expect("a fresh database opens")
            .pool;
        let (settings, _) = SettingsStore::load(dir.path().join("config.json"));
        let settings = Arc::new(settings);
        let authority = crate::folders::LiveAuthority::new(
            Arc::clone(&settings),
            dir.path().to_path_buf(),
            pool,
        );

        Fixture {
            folders: Arc::new(FoldersCache::new(dir.path().to_path_buf(), authority)),
            settings,
            http: Arc::new(HttpClient::new().expect("the HTTP client builds")),
            _dir: dir,
        }
    }

    /// §2.8 step 7: v1 gated the scrobbler in the same block as the tray, the
    /// updater and Discord, so the harness gets none of them.
    #[tokio::test]
    async fn the_harness_gets_no_scrobbler() {
        let parts = fixture().await;

        assert!(build_scrobbler(true, &parts.settings, &parts.http).is_none());
    }

    /// …and a real launch does, whether or not this build carries a Last.fm
    /// credential: ListenBrainz needs no application key, so a build without one
    /// still scrobbles to the service the user configured.
    #[tokio::test]
    async fn a_normal_launch_gets_a_scrobbler_even_without_a_lastfm_key() {
        let parts = fixture().await;
        let scrobbler = build_scrobbler(false, &parts.settings, &parts.http);

        assert!(scrobbler.is_some());
        assert_eq!(
            scrobbler.expect("just asserted").is_lastfm_configured(),
            LastfmCredentials::from_build_env().is_some(),
            "the Last.fm half follows the compiled-in credential and nothing else"
        );
    }

    /// The policy reads the preference on every call rather than capturing it,
    /// which the trait requires so a settings toggle takes effect on the next
    /// track instead of the next launch.
    #[tokio::test]
    async fn the_lyrics_preference_is_read_per_fetch() {
        let parts = fixture().await;
        let policy = CachePolicy {
            folders: Arc::clone(&parts.folders),
            settings: Arc::clone(&parts.settings),
        };

        assert!(!policy.prefer_synced_from_lrclib(), "unset means off");

        parts
            .settings
            .set(
                shiranami_core::store::RendererStoreKey::LyricsPreferSyncedFromLrclib,
                serde_json::Value::Bool(true),
            )
            .expect("the settings file writes");

        assert!(
            policy.prefer_synced_from_lrclib(),
            "the same policy object must see the new value"
        );
    }

    /// The lyrics policy asks the *same* guard the audio route asks. A second
    /// containment answer here would be a second security boundary to keep in
    /// agreement with the first.
    #[tokio::test]
    async fn the_lyrics_policy_defers_to_the_folders_cache() {
        let parts = fixture().await;
        let policy = CachePolicy {
            folders: Arc::clone(&parts.folders),
            settings: Arc::clone(&parts.settings),
        };

        let stray = std::path::Path::new("/etc/passwd");
        assert_eq!(
            policy.is_local_resolution_allowed(stray),
            parts.folders.is_path_allowed(stray)
        );
    }

    #[tokio::test]
    async fn lyrics_are_always_built() {
        let parts = fixture().await;

        // Constructed once, because its LRU and its in-flight coalescing map are
        // its entire memory; a per-call service would re-request LRCLIB on every
        // track change.
        let service = build_lyrics(&parts.folders, &parts.settings, &parts.http);
        assert_eq!(Arc::strong_count(&service), 1);
    }
}
