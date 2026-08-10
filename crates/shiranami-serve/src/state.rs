//! What the routes are given, and what they are deliberately not given.
//!
//! The state holds seams, not implementations: the containment guard arrives as
//! `Arc<FoldersCache>` from `shiranami-core`, the SSRF guard as the *same*
//! `UrlGuard` instance the HTTP client uses, and the radio upstream as
//! `Arc<dyn RadioUpstream>`. That last one is what makes the redirect tests
//! possible — a fake upstream can answer with any hop chain, while the guard
//! deciding whether to follow it stays the real one, so the refusal test is
//! testing the real classifier rather than a mock of it.
//!
//! There is no database handle here and no settings store. Everything the
//! routes need to know about which paths are legitimate is already inside
//! `FoldersCache`, which is the point of it being a rank-0 type.

use std::path::PathBuf;
use std::sync::Arc;

use shiranami_core::paths::FoldersCache;
use shiranami_net::url_safety::UrlGuard;

use crate::art_cache::ArtCache;
use crate::icy::NowPlayingSink;
use crate::token::SessionToken;
use crate::upstream::RadioUpstream;

/// How many redirects the radio proxy will follow. v1's `MAX_REDIRECTS`.
pub const MAX_REDIRECTS: usize = 5;

/// Everything the server needs to be built.
///
/// Separate from [`ServeState`] because the caller supplies these and the server
/// derives the rest — the token in particular, which is minted during
/// [`crate::start`] so no caller is in a position to pass a predictable one.
pub struct ServeConfig {
    /// The containment guard: which files the audio route may open.
    pub folders: Arc<FoldersCache>,
    /// Where album art lives on disk — `<userData>/album-art` in v1's layout.
    pub art_dir: PathBuf,
    /// The SSRF guard, shared with the HTTP client so both judge by one clock.
    pub guard: UrlGuard,
    /// How the radio proxy reaches a station.
    pub upstream: Arc<dyn RadioUpstream>,
    /// Where the radio proxy reports each new ICY `StreamTitle`.
    ///
    /// Defaults to [`NowPlayingSink::discarding`] via [`ServeConfig::new`], so
    /// an embedder with no renderer to tell — the tests, a future headless
    /// build — needs no wiring. `src-tauri` overwrites it with one that emits
    /// the `radio:now-playing` event.
    pub now_playing: NowPlayingSink,
}

impl ServeConfig {
    /// The config the app runs with: art beside the rest of the app data, and
    /// the radio proxy going through the shared HTTP client.
    pub fn new(
        folders: Arc<FoldersCache>,
        art_dir: PathBuf,
        client: shiranami_net::HttpClient,
    ) -> Self {
        Self {
            folders,
            art_dir,
            guard: client.guard().clone(),
            upstream: Arc::new(crate::upstream::NetUpstream::new(client)),
            now_playing: NowPlayingSink::discarding(),
        }
    }
}

/// The state every route handler is handed.
///
/// Cheap to clone: axum clones it per request, and everything inside is either
/// an `Arc` or a `String`.
#[derive(Clone)]
pub struct ServeState {
    inner: Arc<Inner>,
}

struct Inner {
    token: SessionToken,
    folders: Arc<FoldersCache>,
    art_dir: PathBuf,
    art_cache: ArtCache,
    guard: UrlGuard,
    upstream: Arc<dyn RadioUpstream>,
    now_playing: NowPlayingSink,
}

impl ServeState {
    /// Build the state for a session, minting nothing — the token is passed in
    /// so the server and the state cannot disagree about what it is.
    pub fn new(config: ServeConfig, token: SessionToken) -> Self {
        Self {
            inner: Arc::new(Inner {
                token,
                folders: config.folders,
                art_dir: config.art_dir,
                art_cache: ArtCache::default(),
                guard: config.guard,
                upstream: config.upstream,
                now_playing: config.now_playing,
            }),
        }
    }

    /// Whether `candidate` is this session's token. Constant time.
    pub fn token_matches(&self, candidate: &str) -> bool {
        self.inner.token.matches(candidate)
    }

    /// This session's token, for the command that hands it to the webview.
    pub fn token(&self) -> &SessionToken {
        &self.inner.token
    }

    /// The containment guard.
    ///
    /// Handed out as an owned `Arc` rather than a reference because the audio
    /// route runs it on a blocking thread, which cannot borrow from a request.
    pub fn folders(&self) -> Arc<FoldersCache> {
        Arc::clone(&self.inner.folders)
    }

    /// The album-art directory.
    pub fn art_dir(&self) -> &std::path::Path {
        &self.inner.art_dir
    }

    /// The album-art LRU.
    pub fn art_cache(&self) -> &ArtCache {
        &self.inner.art_cache
    }

    /// The SSRF guard, re-run on every redirect hop.
    pub fn guard(&self) -> &UrlGuard {
        &self.inner.guard
    }

    /// The radio upstream.
    pub fn upstream(&self) -> &Arc<dyn RadioUpstream> {
        &self.inner.upstream
    }

    /// Where to report ICY `StreamTitle`s.
    pub fn now_playing(&self) -> &NowPlayingSink {
        &self.inner.now_playing
    }
}

impl std::fmt::Debug for ServeState {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // The token redacts itself; the art dir is a user path, so it stays out
        // of anything that might reach a log.
        formatter
            .debug_struct("ServeState")
            .field("token", &self.inner.token)
            .finish_non_exhaustive()
    }
}
