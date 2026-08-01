//! The server under test, its fixtures, and the requests they answer.
//!
//! Every test binds the **real** server on an ephemeral port and talks to it
//! over real HTTP. That is deliberate, and it is why this crate exists
//! separately from `src-tauri`: a Range matrix asserted against handler
//! functions would pass while the framework dropped a header on the way out, and
//! a dropped `Access-Control-Allow-Origin` is exactly the failure that produces
//! a silent player rather than an error.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use shiranami_core::paths::FoldersCache;
use shiranami_core::paths::authority::{PathAuthority, PathAuthorityResult};
use shiranami_net::url_safety::UrlGuard;
use shiranami_serve::server::ServeHandle;
use shiranami_serve::state::ServeConfig;
use shiranami_serve::upstream::RadioUpstream;
use tempfile::TempDir;

use super::fakes::{FakeUpstream, TestResolver};

/// A running server plus the fixtures it is serving from.
pub struct Harness {
    pub handle: ServeHandle,
    pub client: reqwest::Client,
    /// An allowed root holding audio fixtures.
    pub music: TempDir,
    /// The album-art directory.
    pub art: TempDir,
    /// A directory that is *not* an allowed root.
    pub outside: TempDir,
    pub upstream: Arc<FakeUpstream>,
    /// Kept alive so the app-data root outlives the server.
    _data: TempDir,
}

impl Harness {
    /// Start a server over fresh temp directories.
    pub async fn start() -> Self {
        Self::start_with(FakeUpstream::new(), TestResolver::new()).await
    }

    /// Start a server with a scripted upstream and resolver.
    pub async fn start_with(upstream: FakeUpstream, resolver: TestResolver) -> Self {
        let data = TempDir::new().expect("a data dir");
        let music = TempDir::new().expect("a music dir");
        let art = TempDir::new().expect("an art dir");
        let outside = TempDir::new().expect("a dir outside every root");

        let authority = TestAuthority {
            downloads: data.path().join("downloads"),
            folders: vec![music.path().to_owned()],
            tracks: Mutex::new(Vec::new()),
        };
        let folders = Arc::new(FoldersCache::new(
            data.path().to_owned(),
            Arc::new(authority),
        ));

        let upstream = Arc::new(upstream);
        let config = ServeConfig {
            folders,
            art_dir: art.path().to_owned(),
            guard: UrlGuard::with_resolver(Arc::new(resolver)),
            upstream: Arc::clone(&upstream) as Arc<dyn RadioUpstream>,
        };

        let handle = shiranami_serve::start(config)
            .await
            .expect("the server binds");

        Self {
            handle,
            // No proxy: a system proxy configured on the developer's machine
            // must not sit between the test and its own loopback server.
            client: reqwest::Client::builder()
                .no_proxy()
                .build()
                .expect("the test client builds"),
            music,
            art,
            outside,
            upstream,
            _data: data,
        }
    }

    /// The URL prefix including the session token.
    pub fn base(&self) -> String {
        self.handle.base_url()
    }

    /// The same prefix with a wrong — but well-formed — token.
    pub fn base_with_wrong_token(&self) -> String {
        format!(
            "http://{}/{}",
            self.handle.address(),
            "0".repeat(self.handle.token().as_str().len())
        )
    }

    /// Write an audio fixture of `size` bytes into the allowed music root.
    pub fn write_audio(&self, name: &str, size: usize) -> PathBuf {
        let path = self.music.path().join(name);
        std::fs::write(&path, pattern(size)).expect("the fixture writes");
        path
    }

    /// Write a file into the directory that is outside every allowed root.
    pub fn write_outside(&self, name: &str, size: usize) -> PathBuf {
        let path = self.outside.path().join(name);
        std::fs::write(&path, pattern(size)).expect("the fixture writes");
        path
    }

    /// Write an album-art fixture into the art directory.
    pub fn write_art(&self, name: &str, size: usize) -> PathBuf {
        let path = self.art.path().join(name);
        std::fs::write(&path, pattern(size)).expect("the fixture writes");
        path
    }

    /// `GET {base}/audio?path=<path>`, with optional headers.
    pub async fn audio(&self, path: &Path, headers: &[(&str, &str)]) -> reqwest::Response {
        let url = format!(
            "{}/audio?path={}",
            self.base(),
            encode(&path.to_string_lossy())
        );
        self.get(&url, headers).await
    }

    /// `GET {base}/art/<name>`.
    pub async fn art(&self, name: &str) -> reqwest::Response {
        let url = format!("{}/art/{name}", self.base());
        self.get(&url, &[]).await
    }

    /// `GET {base}/radio?url=<url>`.
    pub async fn radio(&self, url: &str) -> reqwest::Response {
        let url = format!("{}/radio?url={}", self.base(), encode(url));
        self.get(&url, &[]).await
    }

    /// A raw GET against this server.
    pub async fn get(&self, url: &str, headers: &[(&str, &str)]) -> reqwest::Response {
        let mut request = self.client.get(url);
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        request
            .send()
            .await
            .expect("the request reaches the server")
    }
}

/// The byte pattern every fixture is filled with: position-dependent, so a
/// response carrying the wrong offset cannot pass by accident.
pub fn pattern(size: usize) -> Vec<u8> {
    (0..size).map(|index| (index % 251) as u8).collect()
}

/// Percent-encode a query-parameter value the way the renderer's URL builder does.
pub fn encode(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

/// The database seam, canned.
struct TestAuthority {
    downloads: PathBuf,
    folders: Vec<PathBuf>,
    tracks: Mutex<Vec<PathBuf>>,
}

impl PathAuthority for TestAuthority {
    fn download_location(&self) -> PathBuf {
        self.downloads.clone()
    }

    fn folder_roots(&self) -> PathAuthorityResult<Vec<PathBuf>> {
        Ok(self.folders.clone())
    }

    fn has_track_at(&self, path: &Path) -> PathAuthorityResult<bool> {
        let tracks = self.tracks.lock().expect("the test lock is not poisoned");
        Ok(tracks.iter().any(|track| track == path))
    }
}
