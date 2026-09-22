//! A scrobbler wired to a loopback server and a real database.
//!
//! Everything under test is driven end to end: a real settings file on disk, a
//! real SQLite database opened through the crate's boot path, and a real HTTP
//! client pointed at a socket. Nothing is mocked except the far side of the
//! network, which is the only part that cannot be run locally.

#![allow(dead_code, reason = "each test file uses a different subset")]

use std::sync::Arc;

use shiranami_core::store::{ScrobbleSettings, SettingsStore};
use shiranami_integrations::scrobble::{
    LastfmClient, LastfmCredentials, ListenBrainzClient, ScrobblePlay, Scrobbler, settings,
};
use shiranami_net::HttpClient;
use sqlx::SqlitePool;
use tempfile::TempDir;

use super::test_server::TestServer;

/// The api key and secret the tests sign with.
pub(crate) const API_KEY: &str = "TESTKEY";
pub(crate) const SECRET: &str = "TESTSECRET";

/// A scrobbler, its database, and the directory both live in.
pub(crate) struct Harness {
    pub(crate) scrobbler: Scrobbler,
    pub(crate) pool: SqlitePool,
    pub(crate) store: Arc<SettingsStore>,
    _dir: TempDir,
}

impl Harness {
    /// A scrobbler whose Last.fm and ListenBrainz calls both reach `server`.
    ///
    /// `configured` decides whether this "build" carries a Last.fm application
    /// credential, which is the difference between the two supported shipping
    /// configurations.
    pub(crate) async fn new(server: &TestServer, configured: bool) -> Self {
        let dir = tempfile::tempdir().expect("a temp dir");
        let (store, _quarantined) = SettingsStore::load(dir.path().join("config.json"));
        let store = Arc::new(store);

        let opened = shiranami_db::open(&dir.path().join("shiranami.db"))
            .await
            .expect("the fixture database opens");

        let http = HttpClient::new().expect("the client builds");
        let lastfm = configured
            .then(|| {
                LastfmCredentials::new(API_KEY, SECRET)
                    .map(|credentials| LastfmClient::new(http.clone(), credentials))
            })
            .flatten()
            .map(|client| client.with_endpoint(server.url("/2.0/")));

        let listenbrainz = ListenBrainzClient::new(http.clone()).with_endpoints(
            server.url("/1/submit-listens"),
            server.url("/1/validate-token"),
        );

        let scrobbler =
            Scrobbler::new(Arc::clone(&store), http, None).with_clients(lastfm, listenbrainz);

        Self {
            scrobbler,
            pool: opened.pool,
            store,
            _dir: dir,
        }
    }

    /// Write the stored scrobbling settings directly, bypassing the auth flows.
    pub(crate) fn set_settings(&self, settings: ScrobbleSettings) {
        settings::save(&self.store, &settings).expect("persist the settings");
    }

    /// The stored settings, as the service reads them.
    pub(crate) fn settings(&self) -> ScrobbleSettings {
        self.store.scrobble_settings()
    }

    /// Everything currently parked, oldest play first.
    pub(crate) async fn parked(&self) -> Vec<shiranami_db::repo::scrobble_queue::QueuedScrobble> {
        let mut conn = self.pool.acquire().await.expect("a connection");
        shiranami_db::repo::scrobble_queue::load(&mut conn)
            .await
            .expect("load the queue")
    }
}

/// Both backends connected, scrobbling on.
pub(crate) fn connected() -> ScrobbleSettings {
    ScrobbleSettings {
        enabled: true,
        lastfm_session_key: Some("SESSION".to_owned()),
        lastfm_username: Some("alice".to_owned()),
        listen_brainz_token: Some("LBTOKEN".to_owned()),
    }
}

/// The play every test submits.
pub(crate) fn play() -> ScrobblePlay {
    ScrobblePlay {
        artist: "Nujabes".to_owned(),
        track: "Aruarian Dance".to_owned(),
        album: Some("Modal Soul".to_owned()),
        duration_seconds: Some(247.0),
        started_at: 1_700_000_000,
    }
}
