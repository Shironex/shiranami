//! The four downloader progress sinks, each one an event emitter.
//!
//! `shiranami-downloader` reports progress by calling a trait method. This
//! module is where each of those four traits becomes a `tauri-specta` event on
//! the channel v1 used, and it is the only place in the crate that decides what
//! a *failed emit* means.
//!
//! # A failed emit is logged, never propagated
//!
//! `Emitter::emit` fails when the payload will not serialize or the webview is
//! gone. Both are conditions under which the download itself is still perfectly
//! valid work, and all four of these sit on paths where the return type is
//! `()` — the crate's sink traits do not return a `Result`, deliberately,
//! because a progress tick that could fail the operation it describes would
//! make a closed window abort a download.
//!
//! v1 had the same property for the same reason, though it got there by
//! accident: `sendToRenderer` no-ops when the window has been destroyed.
//!
//! # Throttling and de-duplication are upstream
//!
//! Neither is here, and neither is missing. The queue throttles its snapshot
//! emissions at 250 ms (`queue::PROGRESS_THROTTLE`, R24) with an immediate
//! flush on a structural change; the binary fetcher de-duplicates whole
//! percentages, which is what turned v1's ~19,000 install-progress calls into
//! 101. An event sink is a shape, not a policy — [`crate::events`] says the
//! same thing from the other side.

use shiranami_core::models::{
    DependencyInstallProgress, DownloadProgress, DownloadQueueSnapshot, InstallProgress,
    PlaylistExtractProgress,
};
use shiranami_downloader::bin::InstallProgressSink;
use shiranami_downloader::download::DownloadProgressSink;
use shiranami_downloader::extract::ExtractProgressSink;
use shiranami_downloader::queue::SnapshotSink;
use tauri::AppHandle;
use tauri_specta::Event as _;

use crate::events::{
    DownloaderDependencyInstallProgress, DownloaderFfmpegInstallProgress,
    DownloaderInstallProgress, DownloaderProgress, DownloaderQueueState, PlaylistExtracting,
};

/// Emit one event, logging rather than propagating a failure.
///
/// A macro rather than a generic function because `tauri_specta::Event::emit`
/// takes `self` by value and each event is a distinct type; a function would
/// need the bound spelled out at every call site for no benefit.
macro_rules! emit {
    ($app:expr, $event:expr, $channel:expr) => {
        if let Err(error) = $event.emit($app) {
            // `warn`, not `error`: the work this describes is still fine, and a
            // closed window is the ordinary way this happens.
            tracing::warn!(channel = $channel, %error, "could not emit a downloader event");
        }
    };
}

/// `downloader:queue-state` — the whole queue, after any structural change.
///
/// The one sink Phase 16 must build, because the queue driver emits from a
/// background task and from `hydrate_and_resume` at boot, neither of which has
/// a command's `AppHandle` to borrow.
pub struct QueueEvents {
    app: AppHandle,
}

impl QueueEvents {
    /// Emit through `app`.
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl SnapshotSink for QueueEvents {
    fn emit(&self, snapshot: DownloadQueueSnapshot) {
        emit!(
            &self.app,
            DownloaderQueueState(snapshot),
            "downloader:queue-state"
        );
    }
}

/// `downloader:progress` — byte progress for the legacy single-URL download.
///
/// Not the queue's path. `downloader:download` is the one-off channel the
/// renderer kept beside the queue, and it is the only caller.
pub struct DownloadEvents {
    app: AppHandle,
}

impl DownloadEvents {
    /// Emit through `app`.
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl DownloadProgressSink for DownloadEvents {
    fn progress(&self, event: DownloadProgress) {
        emit!(&self.app, DownloaderProgress(event), "downloader:progress");
    }
}

/// `downloader:dependency-install-progress` — the combined two-tool install.
///
/// Distinct from the two single-tool channels, which carry only a percentage
/// and are emitted directly by `downloader:install-ytdlp` /
/// `downloader:install-ffmpeg` through a closure. This one carries the target,
/// the overall percentage and the label, because `downloader:install-dependencies`
/// drives one progress bar across up to two downloads.
pub struct DependencyInstallEvents {
    app: AppHandle,
}

impl DependencyInstallEvents {
    /// Emit through `app`.
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl InstallProgressSink for DependencyInstallEvents {
    fn progress(&self, event: DependencyInstallProgress) {
        emit!(
            &self.app,
            DownloaderDependencyInstallProgress(event),
            "downloader:dependency-install-progress"
        );
    }
}

/// `playlist:extract-progress` — one tick per Spotify track, twice per track.
///
/// The trait hands three positional arguments; the event carries v1's
/// `{ current, total, trackName }` object. The clamp v1 applied at the call
/// site (`Math.min(completed + 1, total)`) already happened upstream — the
/// extractor's four-worker pool would otherwise report a `current` past `total`
/// for the last three tracks in flight — so this is a pure translation.
pub struct ExtractEvents {
    app: AppHandle,
}

impl ExtractEvents {
    /// Emit through `app`.
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl ExtractProgressSink for ExtractEvents {
    fn progress(&self, current: usize, total: usize, track_name: &str) {
        emit!(
            &self.app,
            PlaylistExtracting(PlaylistExtractProgress {
                // `usize` to `u32` cannot lose a playlist: Spotify's embed page
                // caps at ~100 tracks and yt-dlp's flat extraction at tens of
                // thousands. `try_into` with a saturating fallback rather than
                // `as`, so a hypothetical overflow reports a stuck counter
                // instead of a wrapped one.
                current: u32::try_from(current).unwrap_or(u32::MAX),
                total: u32::try_from(total).unwrap_or(u32::MAX),
                track_name: track_name.to_owned(),
            }),
            "playlist:extract-progress"
        );
    }
}

/// Which single-tool install channel a bare percentage belongs to.
///
/// An enum rather than two sink types because the payload is identical and only
/// the channel differs — but it is an enum rather than a boolean, and the two
/// arms are spelled out in [`InstallPercentEvents::percent`], because
/// `downloader:install-progress` and `downloader:ffmpeg-install-progress` are
/// two listeners driving two progress bars in v1's settings panel. Collapsing
/// them into one channel would drive both bars from whichever install ran last.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallChannel {
    /// `downloader:install-progress`.
    YtDlp,
    /// `downloader:ffmpeg-install-progress`.
    Ffmpeg,
}

/// `downloader:install-progress` / `downloader:ffmpeg-install-progress`.
///
/// The single-tool channels, which carry `{ percent }` and nothing else. The
/// binary fetcher de-duplicates whole percentages upstream, so this emits at
/// most 101 times per install rather than once per HTTP chunk.
pub struct InstallPercentEvents {
    app: AppHandle,
    channel: InstallChannel,
}

impl InstallPercentEvents {
    /// Emit `channel` through `app`.
    pub fn new(app: AppHandle, channel: InstallChannel) -> Self {
        Self { app, channel }
    }
}

impl shiranami_downloader::bin::ProgressSink for InstallPercentEvents {
    fn percent(&self, percent: u32) {
        let progress = InstallProgress { percent };
        match self.channel {
            InstallChannel::YtDlp => emit!(
                &self.app,
                DownloaderInstallProgress(progress),
                "downloader:install-progress"
            ),
            InstallChannel::Ffmpeg => emit!(
                &self.app,
                DownloaderFfmpegInstallProgress(progress),
                "downloader:ffmpeg-install-progress"
            ),
        }
    }
}
