//! The precedence ladder: which source wins, and when the network is consulted.
//!
//! Ported from `fetchLyrics` in `apps/desktop/src/main/services/lyrics-service.ts`.
//!
//! # Precedence
//!
//! With `lyrics.preferSyncedFromLrclib` **off** (the default), anything found
//! locally beats the network outright, and the network is not called at all:
//!
//! ```text
//! local(synced) → embedded(synced) → local(plain) → embedded(plain)
//!               → lrclib(synced) → lrclib(plain)
//! ```
//!
//! With it **on**, LRCLIB's *timed* lyrics outrank local *untimed* ones — the
//! setting exists for users who would rather have a synced lyric from the
//! directory than a plain text file they happen to own:
//!
//! ```text
//! local(synced) → embedded(synced) → lrclib(synced)
//!               → local(plain) → embedded(plain) → lrclib(plain)
//! ```
//!
//! A synced *local* or *embedded* file wins in both states, and short-circuits
//! before the network is touched. Without a file path — a radio stream, say —
//! only LRCLIB is consulted.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use shiranami_core::models::lyrics::LyricsResult;

use crate::lyrics::cache::{InflightLookups, LyricsCache, cache_key};
use crate::lyrics::embedded::read_embedded_lyrics;
use crate::lyrics::error::{LyricsError, Result};
use crate::lyrics::local::load_local_lyrics;
use crate::lyrics::lrclib::{LrclibClient, LrclibOutcome, LrclibQuery};
use crate::lyrics::parse::{has_plain_lyrics, has_synced_lyrics};

/// The two app-level facts the ladder consults.
///
/// Inverted into a trait for the same reason
/// [`shiranami_core::paths::PathAuthority`] is: the containment gate is owned by
/// the folders cache and the preference by the settings store, both of which are
/// assembled in the composition root. Grouped into one trait because they are
/// asked together, once, on every fetch.
pub trait LyricsPolicy: Send + Sync {
    /// Whether local lyric files beside `path` may be read.
    ///
    /// The same containment gate the audio and shell handlers use: only paths
    /// inside the library roots, the app data directory, or the `tracks` table
    /// may be probed, so a compromised renderer cannot turn this channel into an
    /// arbitrary-file reader. Radio-stream pseudo-paths are denied here too and
    /// fall through to the network.
    ///
    /// Implementations must fail **closed**.
    fn is_local_resolution_allowed(&self, path: &Path) -> bool;

    /// The `lyrics.preferSyncedFromLrclib` setting.
    ///
    /// Read on every fetch rather than captured, so toggling it in settings
    /// takes effect on the next track without a restart.
    fn prefer_synced_from_lrclib(&self) -> bool;
}

/// One lyrics request.
#[derive(Debug, Clone, Default)]
pub struct LyricsRequest {
    /// Track title.
    pub title: String,
    /// Track artist.
    pub artist: String,
    /// Album, when known.
    pub album: Option<String>,
    /// Track length in seconds.
    pub duration_seconds: Option<f64>,
    /// The audio file, when the track is a local one.
    pub file_path: Option<PathBuf>,
}

/// Resolves lyrics across the three sources.
pub struct LyricsService {
    lrclib: LrclibClient,
    cache: LyricsCache,
    inflight: InflightLookups,
    policy: Arc<dyn LyricsPolicy>,
}

impl LyricsService {
    /// A service over `lrclib`, consulting `policy` for containment and the
    /// user's precedence preference.
    pub fn new(lrclib: LrclibClient, policy: Arc<dyn LyricsPolicy>) -> Self {
        Self {
            lrclib,
            cache: LyricsCache::new(),
            inflight: InflightLookups::new(),
            policy,
        }
    }

    /// Resolve lyrics for `request`.
    ///
    /// # Errors
    ///
    /// [`LyricsError::Lookup`] when LRCLIB could not be reached *and* no local
    /// or embedded source could answer. A track the directory genuinely lacks
    /// is `Ok` with an empty result, not an error — the caller must be able to
    /// tell "no lyrics exist" from "we could not find out".
    pub async fn fetch(&self, request: &LyricsRequest) -> Result<LyricsResult> {
        let (local, embedded) = match self.read_file_sources(request).await {
            FileSources::Winner(result) => return Ok(result),
            FileSources::Candidates { local, embedded } => (local, embedded),
        };

        let prefer_synced = self.policy.prefer_synced_from_lrclib();

        // Default: any local content at all beats the network, so a plain local
        // hit skips the request entirely.
        if !prefer_synced && let Some(winner) = first_plain([local.as_ref(), embedded.as_ref()]) {
            return Ok(winner.clone());
        }

        // LRCLIB is needed to settle the decision.
        let (network, failure) = match self.lookup(request).await {
            Ok(LrclibOutcome::Found(result)) => (Some(result), None),
            Ok(LrclibOutcome::Missing) => (None, None),
            Err(error) => (None, Some(error)),
        };

        let ordered: Vec<Option<&LyricsResult>> = if prefer_synced {
            vec![
                synced_only(network.as_ref()),
                plain_only(local.as_ref()),
                plain_only(embedded.as_ref()),
                plain_only(network.as_ref()),
            ]
        } else {
            vec![synced_only(network.as_ref()), plain_only(network.as_ref())]
        };

        if let Some(winner) = ordered.into_iter().flatten().next() {
            return Ok(winner.clone());
        }

        // Nothing answered. A failed lookup must surface as a failure rather
        // than as "this track has no lyrics" — see `crate::lyrics::error`.
        match failure {
            Some(error) => Err(LyricsError::Lookup(error)),
            None => Ok(empty_result()),
        }
    }

    /// Read the two file-backed sources, short-circuiting on a synced hit.
    ///
    /// Ordered so the expensive tag parse is skipped whenever a synced sidecar
    /// file already answered.
    async fn read_file_sources(&self, request: &LyricsRequest) -> FileSources {
        let Some(path) = request.file_path.as_deref() else {
            return FileSources::Candidates {
                local: None,
                embedded: None,
            };
        };

        if !self.policy.is_local_resolution_allowed(path) {
            tracing::debug!(
                path = %path.display(),
                "local lyric resolution skipped (path not allowed)"
            );
            return FileSources::Candidates {
                local: None,
                embedded: None,
            };
        }

        let local = load_local_lyrics(path).await;
        if has_synced_lyrics(local.as_ref()) {
            tracing::info!(title = request.title, "using local synced lyrics");
            return FileSources::Winner(local.unwrap_or_else(empty_result));
        }

        let embedded = read_embedded(path).await;
        if has_synced_lyrics(embedded.as_ref()) {
            tracing::info!(title = request.title, "using embedded synced lyrics");
            return FileSources::Winner(embedded.unwrap_or_else(empty_result));
        }

        FileSources::Candidates { local, embedded }
    }

    /// LRCLIB with session memoisation: cache first, then a coalesced request.
    async fn lookup(&self, request: &LyricsRequest) -> Result<LrclibOutcome, super::LookupFailure> {
        let key = cache_key(&request.title, &request.artist);
        if let Some(cached) = self.cache.get(&key) {
            return Ok(cached);
        }

        let query = LrclibQuery {
            title: request.title.clone(),
            artist: request.artist.clone(),
            album: request.album.clone(),
            duration_seconds: request.duration_seconds,
        };

        let outcome = self.inflight.run(&key, || self.lrclib.lookup(&query)).await;

        // A definitive answer is cached, including a miss. A failure is not:
        // caching it would mark a rate-limited track lyric-less for the session.
        if let Ok(settled) = &outcome {
            self.cache.set(&key, settled.clone());
        }

        outcome
    }
}

/// What the file-backed sources produced.
enum FileSources {
    /// A synced hit that ends the search before the network.
    Winner(LyricsResult),
    /// Whatever was found, for the ladder to rank against the network.
    Candidates {
        local: Option<LyricsResult>,
        embedded: Option<LyricsResult>,
    },
}

/// Tag reading is synchronous and touches the disk, so it runs off the async
/// worker rather than blocking it (architecture §2.3).
async fn read_embedded(path: &Path) -> Option<LyricsResult> {
    let owned = path.to_path_buf();
    match tokio::task::spawn_blocking(move || read_embedded_lyrics(&owned)).await {
        Ok(found) => found,
        Err(error) => {
            tracing::warn!(path = %path.display(), %error, "embedded lyric read panicked");
            None
        }
    }
}

/// The first candidate carrying plain text.
fn first_plain<'a>(
    candidates: impl IntoIterator<Item = Option<&'a LyricsResult>>,
) -> Option<&'a LyricsResult> {
    candidates
        .into_iter()
        .flatten()
        .find(|candidate| has_plain_lyrics(Some(candidate)))
}

/// `result`, but only if it carries timed lines.
fn synced_only(result: Option<&LyricsResult>) -> Option<&LyricsResult> {
    result.filter(|found| has_synced_lyrics(Some(found)))
}

/// `result`, but only if it carries plain text.
fn plain_only(result: Option<&LyricsResult>) -> Option<&LyricsResult> {
    result.filter(|found| has_plain_lyrics(Some(found)))
}

/// The "nothing found" answer. Distinct from an error: the lookup succeeded.
fn empty_result() -> LyricsResult {
    LyricsResult {
        synced: None,
        plain: None,
        source: None,
    }
}
