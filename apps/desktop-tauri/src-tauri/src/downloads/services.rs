//! The downloader services a command reaches, and the one piece of state v1
//! kept in a module-level variable.
//!
//! Four of the five fields are stateless service objects — they hold paths and
//! `Arc`s and could be rebuilt per command. They are built once anyway, because
//! rebuilding them per command would mean every command that touches yt-dlp
//! needed the binary directory and the platform, which are **boot** values, and
//! §2.3 has exactly one place for those.
//!
//! # The extraction token is real cross-call state
//!
//! `playlist:cancel` takes no arguments and cancels whatever `playlist:extract`
//! is running. v1 held an `AbortController` in a module-level `let`, which is a
//! global; §2.3 forbids one, so it lives here and is reached through
//! [`crate::state::AppState`] like everything else.
//!
//! The semantics are v1's, including the part that reads like a bug and is not:
//! **a second `extract` aborts the first.** v1 called `activeExtraction?.abort()`
//! before starting a new controller, because the extraction UI is a single
//! modal — a second extraction means the user typed a new URL, and leaving four
//! yt-dlp searches running for a playlist nobody will see is the actual bug.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use shiranami_downloader::bin::{FfmpegManager, Platform, Tools, YtDlpManager};
use shiranami_downloader::download::{DownloadRunner, YtDlpDownloader};
use shiranami_downloader::extract::PlaylistExtractor;
use shiranami_downloader::search::SearchService;
use shiranami_downloader::spawn::{FfmpegAvailability, ProcessRunner};
use shiranami_net::HttpClient;
use tokio_util::sync::CancellationToken;

/// Everything `downloader:*` and `playlist:*` delegate into.
pub struct DownloaderServices {
    tools: Tools,
    search: SearchService,
    extractor: PlaylistExtractor,
    downloader: Arc<dyn DownloadRunner>,
    /// `Arc` for **identity**, not for sharing: `end_extraction` has to answer
    /// "is this still the run I started?", which v1 spelled `===` on the
    /// controller. `CancellationToken` is a cheap clonable handle with no
    /// equality of its own, so pointer identity is what reproduces that check.
    extraction: Mutex<Option<Arc<CancellationToken>>>,
}

impl DownloaderServices {
    /// Build every service over one process runner and one HTTP client.
    ///
    /// `bin_dir` is `data_dir/bin` ([`shiranami_downloader::bin::bin_dir`]) and
    /// `platform` is normally [`Platform::HOST`]; both are parameters rather
    /// than lookups so a test can point the whole surface at a temporary
    /// directory and a scripted runner.
    pub fn new(
        processes: Arc<dyn ProcessRunner>,
        http: Arc<HttpClient>,
        bin_dir: PathBuf,
        platform: Platform,
    ) -> Self {
        let ytdlp = YtDlpManager::new(
            bin_dir.clone(),
            platform,
            Arc::clone(&http),
            Arc::clone(&processes),
        );
        let ffmpeg =
            FfmpegManager::new(bin_dir, platform, Arc::clone(&http), Arc::clone(&processes));

        let yt_dlp_path = ytdlp.path();
        // The managed ffmpeg, passed to yt-dlp as `--ffmpeg-location`. Naming
        // the directory rather than probing `PATH` is what makes a download
        // behave the same on a machine that happens to have a system ffmpeg and
        // one that does not.
        let availability = FfmpegAvailability::Managed(ffmpeg.directory().to_path_buf());

        let downloader = Arc::new(YtDlpDownloader::new(
            Arc::clone(&processes),
            yt_dlp_path.clone(),
            availability,
        ));

        Self {
            search: SearchService::new(
                Arc::clone(&processes),
                Arc::clone(&http),
                yt_dlp_path.clone(),
            ),
            extractor: PlaylistExtractor::new(
                Arc::clone(&processes),
                Arc::clone(&http),
                yt_dlp_path,
            ),
            tools: Tools::new(ytdlp, ffmpeg),
            downloader,
            extraction: Mutex::new(None),
        }
    }

    /// The yt-dlp and ffmpeg managers.
    pub fn tools(&self) -> &Tools {
        &self.tools
    }

    /// yt-dlp search, suggest and stream-URL resolution.
    pub fn search(&self) -> &SearchService {
        &self.search
    }

    /// YouTube and Spotify playlist extraction.
    pub fn extractor(&self) -> &PlaylistExtractor {
        &self.extractor
    }

    /// The single-URL download runner behind `downloader:download`.
    pub fn downloader(&self) -> &Arc<dyn DownloadRunner> {
        &self.downloader
    }

    /// Take a token for a new extraction, cancelling any run still in flight.
    ///
    /// v1's `activeExtraction?.abort(); activeExtraction = controller;`.
    pub fn begin_extraction(&self) -> Arc<CancellationToken> {
        let token = Arc::new(CancellationToken::new());
        if let Some(previous) = self.swap_extraction(Some(Arc::clone(&token))) {
            previous.cancel();
        }
        token
    }

    /// Clear `token` if it is still the active one.
    ///
    /// v1's `finally { if (activeExtraction === controller) activeExtraction = null; }`.
    /// The identity check is load-bearing: without it a slow extraction
    /// finishing *after* a newer one started would clear the newer one's token,
    /// and `playlist:cancel` would then cancel nothing.
    pub fn end_extraction(&self, token: &Arc<CancellationToken>) {
        let mut active = lock(&self.extraction);
        if active
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, token))
        {
            *active = None;
        }
    }

    /// `playlist:cancel` — abort whatever extraction is running.
    ///
    /// A no-op when none is, exactly as v1's `activeExtraction?.abort()` was.
    pub fn cancel_extraction(&self) {
        if let Some(token) = self.swap_extraction(None) {
            token.cancel();
        }
    }

    fn swap_extraction(
        &self,
        next: Option<Arc<CancellationToken>>,
    ) -> Option<Arc<CancellationToken>> {
        std::mem::replace(&mut *lock(&self.extraction), next)
    }
}

/// Take the extraction lock, recovering from a poisoned one.
///
/// The guarded value is one `Option<CancellationToken>` and nothing between the
/// lock and the swap can panic, so a poisoned lock means a panic elsewhere in
/// the process — not a torn value here. Propagating it would turn every later
/// `playlist:cancel` into a failure for no benefit.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn services(dir: &std::path::Path) -> DownloaderServices {
        DownloaderServices::new(
            Arc::new(crate::downloads::testing::ScriptedRunner::default()),
            Arc::new(HttpClient::new().expect("the HTTP client must build")),
            dir.join("bin"),
            Platform::MacOs,
        )
    }

    #[test]
    fn cancelling_with_no_extraction_running_is_a_no_op() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let services = services(dir.path());

        services.cancel_extraction();
    }

    #[test]
    fn cancel_aborts_the_running_extraction() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let services = services(dir.path());

        let token = services.begin_extraction();
        assert!(!token.is_cancelled());

        services.cancel_extraction();
        assert!(token.is_cancelled());
    }

    /// v1 aborted the previous controller before installing a new one, because
    /// the extraction UI is a single modal and a superseded run is four yt-dlp
    /// searches nobody will see the results of.
    #[test]
    fn a_second_extraction_aborts_the_first() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let services = services(dir.path());

        let first = services.begin_extraction();
        let second = services.begin_extraction();

        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());
    }

    /// The identity check in `end_extraction`. Without it, a slow run finishing
    /// after a newer one started would clear the newer one's token and
    /// `playlist:cancel` would then cancel nothing at all.
    #[test]
    fn a_finished_extraction_does_not_clear_a_newer_one() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let services = services(dir.path());

        let first = services.begin_extraction();
        let second = services.begin_extraction();

        // The superseded run finishes and tidies up after itself.
        services.end_extraction(&first);

        services.cancel_extraction();
        assert!(
            second.is_cancelled(),
            "the live token must still be reachable"
        );
    }
}
