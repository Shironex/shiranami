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
use crate::lyrics::local::{existing_lrc_sidecar, load_local_lyrics};
use crate::lyrics::lrclib::{LrclibClient, LrclibOutcome, LrclibQuery};
use crate::lyrics::parse::{has_plain_lyrics, has_synced_lyrics};
use crate::lyrics::writeback::{SidecarOutcome, SidecarSkip, save_synced_sidecar};

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

    /// The `lyrics.saveFetchedLyrics` setting: may a synced LRCLIB hit be
    /// written to a `.lrc` beside the track?
    ///
    /// **Defaults to `false` on the trait**, which is not a convenience. Writing
    /// into a music library is opt-in, and a default here means a policy written
    /// before this lane existed — or a test double, or a future implementation
    /// whose author never read this file — cannot accidentally start writing to
    /// somebody's rips. Opting in has to be a positive act in the implementation.
    fn should_save_fetched_lyrics(&self) -> bool {
        false
    }

    /// Whether a lyric file may be *written* beside `path`.
    ///
    /// A separate question from [`Self::is_local_resolution_allowed`] and a
    /// stricter one. Reading is granted to anything the shell handlers may
    /// reach, which includes the app's own data directory and any row in the
    /// `tracks` table — appropriate for a read, and too wide for a write, which
    /// must land inside a folder the user actually pointed the library at.
    ///
    /// Defaults closed, for [`Self::should_save_fetched_lyrics`]'s reason.
    /// Implementations must fail **closed**.
    fn is_lyrics_write_allowed(&self, _path: &Path) -> bool {
        false
    }
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
        let (found, failure) = match self.lookup(request).await {
            Ok(LrclibOutcome::Found(found)) => (Some(found), None),
            Ok(LrclibOutcome::Missing) => (None, None),
            Err(error) => (None, Some(error)),
        };

        // Before the ranking, and regardless of which candidate goes on to win:
        // the reason to keep the file is that the network was reachable *now*
        // and may not be later, which has nothing to do with what the ladder
        // decides to display this time round.
        if let Some(lrc) = found.as_ref().and_then(|found| found.synced_lrc.as_deref()) {
            self.save_sidecar(request, lrc).await;
        }

        let network = found.map(|found| found.result);

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

    /// Whether the user has opted in to saving fetched lyrics.
    ///
    /// Exposed so the command layer can refuse a batch up front rather than run
    /// one to an all-skipped summary, without reaching past the service for the
    /// settings key — which would be a second place for the answer to live.
    pub fn is_saving_enabled(&self) -> bool {
        self.policy.should_save_fetched_lyrics()
    }

    /// Fetch `request` from LRCLIB and keep the result as a `.lrc`, reporting
    /// what happened.
    ///
    /// The library batch's per-track unit, and the reason it is a method rather
    /// than a second copy of [`Self::fetch`]'s tail: it shares the same client,
    /// the same MRU and the same policy, so a run over a library the user has
    /// been playing costs nothing for the tracks already answered.
    ///
    /// Deliberately **not** the ladder. A batch is not deciding what to display,
    /// so local and embedded sources are consulted only through the
    /// never-overwrite check inside the write itself — which is also what keeps
    /// a track that already has a `.lrc` from spending an LRCLIB request.
    pub async fn save_lyrics(&self, request: &LyricsRequest) -> SaveOutcome {
        let Some(path) = request.file_path.as_deref() else {
            return SaveOutcome::Skipped(SidecarSkip::NoDestination);
        };

        if let Some(refusal) = self.write_refusal(path) {
            return SaveOutcome::Skipped(refusal);
        }

        // Asked before the request, not after: a track the user has already
        // timed themselves must not cost the directory a lookup.
        if let Some(refusal) = already_answered(path).await {
            return SaveOutcome::Skipped(refusal);
        }

        let found = match self.lookup(request).await {
            Ok(LrclibOutcome::Found(found)) => found,
            Ok(LrclibOutcome::Missing) => return SaveOutcome::NotFound,
            Err(error) => {
                tracing::debug!(title = request.title, %error, "lyrics lookup failed");
                return SaveOutcome::LookupFailed;
            }
        };

        let Some(lrc) = found.synced_lrc.as_deref() else {
            // The directory has the track but only as plain text. Nothing to
            // write: a `.lrc` with no timings would shadow a future timed one.
            return SaveOutcome::Skipped(SidecarSkip::NotSynced);
        };

        match save_synced_sidecar(path, lrc).await {
            SidecarOutcome::Written(path) => SaveOutcome::Saved(path),
            SidecarOutcome::Skipped(reason) => SaveOutcome::Skipped(reason),
            SidecarOutcome::Failed => SaveOutcome::WriteFailed,
        }
    }

    /// Write-back on the fetch path: the two policy gates, then the write.
    ///
    /// Awaited rather than spawned. The write is one small file on the blocking
    /// pool, and detaching it would let a fetch resolve while its sidecar is
    /// still in flight — which is exactly the window in which a shutdown loses
    /// the file the feature exists to keep.
    async fn save_sidecar(&self, request: &LyricsRequest, lrc: &str) {
        let Some(path) = request.file_path.as_deref() else {
            return;
        };

        if self.write_refusal(path).is_some() {
            return;
        }

        save_synced_sidecar(path, lrc).await;
    }

    /// Which gate refuses a write beside `path`, if either does.
    ///
    /// Both are read per call rather than captured, for the same reason
    /// [`LyricsPolicy::prefer_synced_from_lrclib`] is: turning the setting off
    /// has to stop the *next* write, not the next launch.
    fn write_refusal(&self, path: &Path) -> Option<SidecarSkip> {
        if !self.policy.should_save_fetched_lyrics() {
            return Some(SidecarSkip::Disabled);
        }

        if !self.policy.is_lyrics_write_allowed(path) {
            tracing::debug!(
                path = %path.display(),
                "lyric write-back skipped (path not inside a library folder)"
            );
            return Some(SidecarSkip::NotAllowed);
        }

        None
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

/// What one [`LyricsService::save_lyrics`] attempt concluded.
///
/// Five outcomes rather than a `Result`, because the batch's summary needs all
/// five kept apart: "the directory does not have it" and "we could not ask" and
/// "we could not write" are three different things for a user deciding whether
/// to run again, and collapsing any pair loses the answer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SaveOutcome {
    /// Written. Carries the sidecar path.
    Saved(PathBuf),
    /// Nothing to do, for a reason that is not a failure.
    Skipped(SidecarSkip),
    /// The directory was reached and genuinely has no lyrics for this track.
    NotFound,
    /// The directory could not be reached. Worth trying again later — which is
    /// exactly what [`SaveOutcome::NotFound`] is not.
    LookupFailed,
    /// Lyrics were found and the filesystem refused the write.
    WriteFailed,
}

/// Whether a lyric file already answers for `path`, off the async worker.
async fn already_answered(path: &Path) -> Option<SidecarSkip> {
    let owned = path.to_path_buf();
    match tokio::task::spawn_blocking(move || existing_lrc_sidecar(&owned)).await {
        Ok(Some(existing)) => {
            tracing::debug!(
                existing = %existing.display(),
                "skipping a track that already has a lyric file"
            );
            Some(SidecarSkip::AlreadyExists)
        }
        Ok(None) => None,
        Err(error) => {
            // Fail closed: not knowing whether the user's file is there is not a
            // licence to write over it.
            tracing::warn!(%error, "lyric sidecar probe panicked");
            Some(SidecarSkip::AlreadyExists)
        }
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

#[cfg(test)]
pub(crate) mod tests {
    //! The ladder itself is exercised end to end over a socket in
    //! `tests/lyrics_precedence.rs`; what is unit-tested here is the write-back
    //! gate, which is a decision this module makes before any I/O and which
    //! therefore needs no server to pin.

    use super::*;
    use shiranami_net::HttpClient;

    /// A policy that answers "no" to everything — the shape a caller gets by
    /// implementing only the two required methods.
    struct DefaultPolicy;

    impl LyricsPolicy for DefaultPolicy {
        fn is_local_resolution_allowed(&self, _path: &Path) -> bool {
            false
        }

        fn prefer_synced_from_lrclib(&self) -> bool {
            false
        }
    }

    /// A policy that has opted in and allows writes anywhere.
    struct WritingPolicy;

    impl LyricsPolicy for WritingPolicy {
        fn is_local_resolution_allowed(&self, _path: &Path) -> bool {
            false
        }

        fn prefer_synced_from_lrclib(&self) -> bool {
            false
        }

        fn should_save_fetched_lyrics(&self) -> bool {
            true
        }

        fn is_lyrics_write_allowed(&self, _path: &Path) -> bool {
            true
        }
    }

    fn service_with(policy: Arc<dyn LyricsPolicy>) -> LyricsService {
        // Port 1 is reserved and refuses instantly, so nothing here waits on a
        // timeout to prove it never dialled.
        LyricsService::new(
            LrclibClient::with_base(
                HttpClient::new().expect("the shared client builds"),
                "http://127.0.0.1:1/api",
            ),
            policy,
        )
    }

    /// A service whose directory is unreachable and whose policy is the default
    /// — used by `crate::lyrics::batch`'s tests, where the assertion is that no
    /// request is made at all.
    pub(crate) fn offline_service() -> LyricsService {
        service_with(Arc::new(DefaultPolicy))
    }

    /// The default is not "write" — a `LyricsPolicy` written before this lane
    /// existed, or a test double, must not start writing into a music folder.
    #[test]
    fn the_trait_defaults_refuse_to_write() {
        let policy = DefaultPolicy;

        assert!(!policy.should_save_fetched_lyrics());
        assert!(!policy.is_lyrics_write_allowed(Path::new("/music/Song.mp3")));
    }

    #[test]
    fn the_opt_out_is_reported_before_the_containment_question() {
        let service = service_with(Arc::new(DefaultPolicy));

        assert_eq!(
            service.write_refusal(Path::new("/music/Song.mp3")),
            Some(SidecarSkip::Disabled)
        );
    }

    /// Opting in is not enough on its own: a path outside every library folder
    /// is still refused, so a stray `tracks` row cannot become a write target.
    #[test]
    fn containment_is_asked_separately_from_the_setting() {
        struct OptedInButContained;

        impl LyricsPolicy for OptedInButContained {
            fn is_local_resolution_allowed(&self, _path: &Path) -> bool {
                true
            }

            fn prefer_synced_from_lrclib(&self) -> bool {
                false
            }

            fn should_save_fetched_lyrics(&self) -> bool {
                true
            }

            fn is_lyrics_write_allowed(&self, path: &Path) -> bool {
                path.starts_with("/music")
            }
        }

        let service = service_with(Arc::new(OptedInButContained));

        assert_eq!(service.write_refusal(Path::new("/music/Song.mp3")), None);
        assert_eq!(
            service.write_refusal(Path::new("/elsewhere/Song.mp3")),
            Some(SidecarSkip::NotAllowed)
        );
    }

    /// A stream has no file to write beside, and the refusal happens before the
    /// directory is consulted — so a radio session costs LRCLIB nothing.
    #[tokio::test]
    async fn a_track_with_no_path_is_skipped_without_a_request() {
        let service = service_with(Arc::new(WritingPolicy));

        let outcome = service
            .save_lyrics(&LyricsRequest {
                title: "Song".to_owned(),
                artist: "Artist".to_owned(),
                ..LyricsRequest::default()
            })
            .await;

        assert_eq!(outcome, SaveOutcome::Skipped(SidecarSkip::NoDestination));
    }

    /// The never-overwrite check runs *before* the lookup, so a library already
    /// full of hand-timed files costs the directory nothing to re-run over.
    #[tokio::test]
    async fn an_existing_sidecar_is_answered_without_a_lookup() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let audio = dir.path().join("Song.mp3");
        std::fs::write(dir.path().join("Song.lrc"), "[00:01.00]Mine").expect("seed the file");

        let service = service_with(Arc::new(WritingPolicy));
        let outcome = service
            .save_lyrics(&LyricsRequest {
                title: "Song".to_owned(),
                artist: "Artist".to_owned(),
                file_path: Some(audio),
                ..LyricsRequest::default()
            })
            .await;

        assert_eq!(outcome, SaveOutcome::Skipped(SidecarSkip::AlreadyExists));
    }

    /// An unreachable directory is `LookupFailed`, never `NotFound`. The batch
    /// summary reports the first as worth retrying and the second as settled.
    #[tokio::test]
    async fn an_unreachable_directory_is_not_reported_as_a_miss() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let service = service_with(Arc::new(WritingPolicy));

        let outcome = service
            .save_lyrics(&LyricsRequest {
                title: "Song".to_owned(),
                artist: "Artist".to_owned(),
                file_path: Some(dir.path().join("Song.mp3")),
                ..LyricsRequest::default()
            })
            .await;

        assert_eq!(outcome, SaveOutcome::LookupFailed);
        assert!(
            !dir.path().join("Song.lrc").exists(),
            "a failed lookup must not leave a file behind"
        );
    }
}
