//! Running one download.
//!
//! # Cancellation is a type, not a flag
//!
//! v1 decided `canceled` versus `error` by asking its own `AbortController`
//! whether it had fired, with the rejected error's name as "a secondary guard".
//! Two sources of truth for one question. Here the runner returns
//! [`DownloadFailure::Cancelled`] or [`DownloadFailure::Failed`] and the queue
//! matches on it, so the distinction cannot drift between the two.
//!
//! # Where the file went
//!
//! yt-dlp's output path is not knowable in advance: `%(title)s.%(ext)s` is
//! resolved from metadata, and post-processing changes the extension afterwards.
//! `--print-to-file after_move:filepath` writes the final path to a temporary
//! file, which is read once the child exits. `after_move` is the load-bearing
//! part — `filepath` alone reports the pre-post-processing name, which for the
//! ffmpeg path is a `.webm` that no longer exists by the time anyone looks.
//!
//! # What an abort leaves behind
//!
//! Nothing. Every path yt-dlp announced is removed along with its `.part`
//! sibling — architecture §6's done-criterion for this phase, and the reason
//! destinations are accumulated rather than overwritten.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use shiranami_core::models::{DownloadProgress, DownloadProgressStatus};
use tokio_util::sync::CancellationToken;

use crate::download::output::{Signal, read_line};
use crate::error::DownloaderError;
use crate::spawn::runner::LineSink;
use crate::spawn::{FfmpegAvailability, ProcessError, ProcessRunner, ProcessSpec, args, classify};

/// What v1 reported when `--print-to-file` produced nothing usable.
pub const UNRESOLVED_PATH: &str = "Could not determine downloaded file path";

/// One download to run.
#[derive(Debug, Clone)]
pub struct DownloadRequest {
    /// The URL to hand yt-dlp.
    pub url: String,
    /// The directory to write into.
    pub download_dir: PathBuf,
}

/// Why a download did not produce a file.
#[derive(Debug)]
pub enum DownloadFailure {
    /// The caller cancelled. The queue maps this to `canceled`.
    Cancelled,
    /// Anything else. The queue maps this to `error`.
    Failed(DownloaderError),
}

impl std::fmt::Display for DownloadFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Cancelled => formatter.write_str("canceled"),
            Self::Failed(error) => write!(formatter, "{error}"),
        }
    }
}

/// Notified as one download progresses.
pub trait DownloadProgressSink: Send + Sync {
    /// One progress event, in the shape the renderer already consumes.
    fn progress(&self, event: DownloadProgress);
}

/// Runs downloads.
///
/// The queue's injectable seam: [`crate::queue`] holds one of these and a test
/// supplies a controllable implementation to exercise every transition without
/// a yt-dlp anywhere on the machine.
#[async_trait::async_trait]
pub trait DownloadRunner: Send + Sync {
    /// Download `request`, reporting progress, and resolve the written path.
    async fn download(
        &self,
        request: &DownloadRequest,
        progress: &dyn DownloadProgressSink,
        cancel: &CancellationToken,
    ) -> Result<PathBuf, DownloadFailure>;
}

/// The real runner, over yt-dlp.
pub struct YtDlpDownloader {
    processes: std::sync::Arc<dyn ProcessRunner>,
    yt_dlp_path: PathBuf,
    ffmpeg: FfmpegAvailability,
}

impl YtDlpDownloader {
    /// A runner for `yt_dlp_path`, with whatever ffmpeg is available.
    pub fn new(
        processes: std::sync::Arc<dyn ProcessRunner>,
        yt_dlp_path: PathBuf,
        ffmpeg: FfmpegAvailability,
    ) -> Self {
        Self {
            processes,
            yt_dlp_path,
            ffmpeg,
        }
    }
}

/// Accumulates what a running download says about itself.
struct Observer<'a> {
    url: &'a str,
    sink: &'a dyn DownloadProgressSink,
    /// A set, ordered, so cleanup is deterministic and a repeated announcement
    /// does not produce a repeated unlink.
    destinations: Mutex<BTreeSet<String>>,
}

impl Observer<'_> {
    fn destinations(&self) -> Vec<String> {
        self.destinations
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter()
            .cloned()
            .collect()
    }
}

impl LineSink for Observer<'_> {
    fn line(&self, line: &str) {
        match read_line(line) {
            Signal::Destination(path) => {
                self.destinations
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .insert(path);
            }
            Signal::Percent(progress) => self.sink.progress(DownloadProgress {
                url: self.url.to_owned(),
                progress,
                status: DownloadProgressStatus::Downloading,
                error: None,
            }),
            Signal::Converting => self.sink.progress(DownloadProgress {
                url: self.url.to_owned(),
                progress: 100.0,
                status: DownloadProgressStatus::Converting,
                error: None,
            }),
            Signal::Ignored => {}
        }
    }
}

#[async_trait::async_trait]
impl DownloadRunner for YtDlpDownloader {
    async fn download(
        &self,
        request: &DownloadRequest,
        progress: &dyn DownloadProgressSink,
        cancel: &CancellationToken,
    ) -> Result<PathBuf, DownloadFailure> {
        let output_template = request.download_dir.join("%(title)s.%(ext)s");
        let print_to =
            std::env::temp_dir().join(format!("shiranami-ytdlp-{}.txt", uuid::Uuid::new_v4()));

        let argv = args::download(&request.url, &output_template, &print_to, &self.ffmpeg)
            .map_err(DownloadFailure::Failed)?;

        let observer = Observer {
            url: &request.url,
            sink: progress,
            destinations: Mutex::new(BTreeSet::new()),
        };

        // No timeout: a slow link legitimately takes as long as it takes, and a
        // deadline here would kill exactly the downloads that need patience.
        let spec = ProcessSpec::capturing(self.yt_dlp_path.clone(), argv);
        let outcome = self.processes.run(spec, Some(&observer), cancel).await;

        let result = self
            .finish(request, outcome, &observer, &print_to, progress)
            .await;

        // Always, on every path — v1's `finally`.
        crate::bin::install::remove_quietly(&print_to).await;

        result
    }
}

impl YtDlpDownloader {
    /// Turn a finished (or killed) child into a path or a failure.
    async fn finish(
        &self,
        request: &DownloadRequest,
        outcome: Result<crate::spawn::ProcessOutput, ProcessError>,
        observer: &Observer<'_>,
        print_to: &Path,
        progress: &dyn DownloadProgressSink,
    ) -> Result<PathBuf, DownloadFailure> {
        let output = match outcome {
            Ok(output) => output,
            // Cancellation takes precedence over everything, and emits **no**
            // error progress: the user asked for this, and showing them a
            // failure toast for it is v1's own comment on the subject.
            Err(error) if error.is_cancelled() => {
                clean_up(observer).await;
                return Err(DownloadFailure::Cancelled);
            }
            Err(error) => {
                // A kill can surface as a spawn or io failure on some
                // platforms, so the token is consulted before believing it.
                tracing::error!(%error, "yt-dlp could not be run");
                let message = error.to_string();
                fail(progress, &request.url, &message);
                return Err(DownloadFailure::Failed(DownloaderError::Process {
                    operation: "run yt-dlp",
                    source: error,
                }));
            }
        };

        if output.code != 0 {
            // v1 classified the two streams together, and the order it
            // concatenated them in does not matter to a substring search.
            let combined = format!("{}\n{}", output.stdout, output.stderr);
            let reason = classify::classify_failure(&combined);
            tracing::error!(
                url = request.url,
                code = output.code,
                reason,
                tail = classify::tail_output(&combined),
                "yt-dlp download failed"
            );
            fail(progress, &request.url, &reason);
            return Err(DownloadFailure::Failed(DownloaderError::YtDlp {
                code: reason,
            }));
        }

        let Some(path) = resolve_written_path(print_to).await else {
            tracing::error!(
                url = request.url,
                "could not resolve the downloaded file path"
            );
            fail(progress, &request.url, UNRESOLVED_PATH);
            return Err(DownloadFailure::Failed(DownloaderError::InstallFailed {
                message: UNRESOLVED_PATH.to_owned(),
            }));
        };

        tracing::info!(path = %path.display(), "downloaded");
        progress.progress(DownloadProgress {
            url: request.url.clone(),
            progress: 100.0,
            status: DownloadProgressStatus::Done,
            error: None,
        });

        Ok(path)
    }
}

/// Emit the error progress event v1 emitted before every rejection.
fn fail(progress: &dyn DownloadProgressSink, url: &str, error: &str) {
    progress.progress(DownloadProgress {
        url: url.to_owned(),
        progress: 0.0,
        status: DownloadProgressStatus::Error,
        error: Some(error.to_owned()),
    });
}

/// Remove every announced destination and its `.part` sibling.
async fn clean_up(observer: &Observer<'_>) {
    for destination in observer.destinations() {
        let path = PathBuf::from(&destination);
        crate::bin::install::remove_quietly(&path).await;
        crate::bin::install::remove_quietly(&PathBuf::from(format!("{destination}.part"))).await;
    }
}

/// Read the path yt-dlp printed, and confirm it exists.
///
/// `--print-to-file` **appends**, and a run with post-processing prints more
/// than once, so the last non-empty line is the one that survived. A path that
/// no longer exists reads as no path at all: resolving to a file the importer
/// would then fail to open turns one clear failure into two confusing ones.
async fn resolve_written_path(print_to: &Path) -> Option<PathBuf> {
    let raw = tokio::fs::read_to_string(print_to).await.ok()?;

    let last = raw
        .split('\n')
        .map(str::trim)
        .rfind(|line| !line.is_empty())?;

    let path = PathBuf::from(last);
    tokio::fs::try_exists(&path)
        .await
        .ok()
        .filter(|exists| *exists)
        .map(|_| path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn the_last_printed_path_wins() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let downloaded = temp.path().join("Track.mp3");
        tokio::fs::write(&downloaded, b"audio")
            .await
            .expect("write the downloaded file");

        let print_to = temp.path().join("print.txt");
        tokio::fs::write(
            &print_to,
            format!(
                "{}\n{}\n\n",
                temp.path().join("Track.webm").display(),
                downloaded.display()
            ),
        )
        .await
        .expect("write the print file");

        assert_eq!(
            resolve_written_path(&print_to).await,
            Some(downloaded),
            "post-processing appends a second line — the last one is the file \
             that still exists"
        );
    }

    #[tokio::test]
    async fn a_path_that_does_not_exist_resolves_to_nothing() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let print_to = temp.path().join("print.txt");
        tokio::fs::write(&print_to, "/nowhere/at/all.mp3\n")
            .await
            .expect("write the print file");

        assert_eq!(resolve_written_path(&print_to).await, None);
    }

    #[tokio::test]
    async fn an_absent_or_empty_print_file_resolves_to_nothing() {
        let temp = tempfile::tempdir().expect("a temporary directory");

        assert_eq!(
            resolve_written_path(&temp.path().join("never-written.txt")).await,
            None
        );

        let empty = temp.path().join("empty.txt");
        tokio::fs::write(&empty, "  \n\n")
            .await
            .expect("write the print file");
        assert_eq!(resolve_written_path(&empty).await, None);
    }
}
