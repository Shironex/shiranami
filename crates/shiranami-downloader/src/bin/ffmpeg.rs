//! The ffmpeg binary manager.
//!
//! Two binaries, not one: yt-dlp's post-processing wants `ffmpeg` for the
//! transcode and `ffprobe` for the format inspection that precedes it, so
//! "installed" means both are present and an install that lands only one has
//! failed. v1's `isFFmpegInstalled` checked both, and its Windows path failed
//! outright when the archive yielded only one.
//!
//! Automatic installation covers macOS and Windows. On anything else v1 threw,
//! and so does this — there is no Linux build host it trusted, and inventing
//! one now would ship users a binary from a source nobody has vetted.

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::Duration;

use regex::Regex;
use serde::Deserialize;
use shiranami_net::{HttpClient, RequestOptions};
use tokio_util::sync::CancellationToken;

use crate::bin::fetch::ProgressSink;
use crate::bin::layout::{self, Platform};
use crate::error::{DownloaderError, Result};
use crate::spawn::{ProcessRunner, ProcessSpec, args};

/// How long the version probe gets. v1's value — a third of yt-dlp's, because
/// `ffmpeg -version` prints a fixed banner and does no work.
const VERSION_TIMEOUT: Duration = Duration::from_secs(10);

/// What v1 threw on a platform with no automatic install.
pub const UNSUPPORTED_PLATFORM: &str =
    "Automatic ffmpeg download is only supported on macOS and Windows";

/// What v1 threw when the Windows archive did not contain what it advertises.
///
/// Declared here beside its sibling rather than in `ffmpeg_install`, which is a
/// private module: a message the renderer displays is part of this manager's
/// public surface even though only one private function raises it.
pub const ARCHIVE_INCOMPLETE: &str =
    "Could not find ffmpeg.exe or ffprobe.exe in downloaded archive";

/// The version out of ffmpeg's banner line.
static VERSION_LINE: LazyLock<Regex> = LazyLock::new(|| {
    #[expect(
        clippy::unwrap_used,
        reason = "a literal pattern that compiles at first use or never"
    )]
    Regex::new(r"ffmpeg version\s+(\S+)").unwrap()
});

/// The one field this crate reads from evermeet.cx's release document.
#[derive(Debug, Deserialize)]
struct EvermeetRelease {
    version: Option<String>,
}

/// Locates, probes and installs ffmpeg and ffprobe.
pub struct FfmpegManager {
    pub(crate) bin_dir: PathBuf,
    pub(crate) platform: Platform,
    pub(crate) client: Arc<HttpClient>,
    pub(crate) runner: Arc<dyn ProcessRunner>,
}

impl FfmpegManager {
    /// A manager over `bin_dir`, for `platform`.
    pub fn new(
        bin_dir: PathBuf,
        platform: Platform,
        client: Arc<HttpClient>,
        runner: Arc<dyn ProcessRunner>,
    ) -> Self {
        Self {
            bin_dir,
            platform,
            client,
            runner,
        }
    }

    /// The directory yt-dlp is pointed at with `--ffmpeg-location`.
    ///
    /// yt-dlp wants the *directory* and finds both binaries in it, which is why
    /// they must be installed side by side.
    pub fn directory(&self) -> &std::path::Path {
        &self.bin_dir
    }

    /// Where the managed ffmpeg lives, whether or not it is there.
    pub fn ffmpeg_path(&self) -> PathBuf {
        layout::ffmpeg_path(&self.bin_dir, self.platform)
    }

    /// Where the managed ffprobe lives, whether or not it is there.
    pub fn ffprobe_path(&self) -> PathBuf {
        layout::ffprobe_path(&self.bin_dir, self.platform)
    }

    /// Whether **both** binaries are present.
    pub async fn is_installed(&self) -> bool {
        tokio::fs::try_exists(self.ffmpeg_path())
            .await
            .unwrap_or(false)
            && tokio::fs::try_exists(self.ffprobe_path())
                .await
                .unwrap_or(false)
    }

    /// The installed version, or `None` when absent or unreadable.
    ///
    /// ffmpeg's banner reads `ffmpeg version 7.1 Copyright (c) …` for a release
    /// build and `ffmpeg version N-113573-g4a2d1b0f9d …` for a nightly. The
    /// regex takes the token after `version` in both cases; when the banner is
    /// shaped some third way, the whole first line is reported rather than
    /// nothing, which is v1's fallback and is still more useful than "unknown".
    pub async fn version(&self) -> Option<String> {
        if !self.is_installed().await {
            return None;
        }

        let spec = ProcessSpec::capturing(self.ffmpeg_path(), args::ffmpeg_version())
            .with_timeout(VERSION_TIMEOUT);

        let output = match self.runner.run(spec, None, &CancellationToken::new()).await {
            Ok(output) if output.code == 0 => output,
            Ok(output) => {
                tracing::error!(code = output.code, "could not read the ffmpeg version");
                return None;
            }
            Err(error) => {
                tracing::error!(%error, "could not read the ffmpeg version");
                return None;
            }
        };

        let first_line = output.stdout.split('\n').next().unwrap_or_default();

        if let Some(captured) = VERSION_LINE.captures(first_line)
            && let Some(version) = captured.get(1)
        {
            return Some(version.as_str().to_owned());
        }

        let trimmed = first_line.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    }

    /// The newest published version, or `None` when the host cannot be reached.
    ///
    /// Each platform has its own upstream, and neither serves the other's
    /// format: evermeet.cx answers with JSON, gyan.dev with a bare version
    /// string in a `.ver` file. Platforms with no automatic install report
    /// `None` rather than a version they could not act on.
    pub async fn latest_version(&self) -> Option<String> {
        let result = match self.platform {
            Platform::MacOs => self
                .client
                .json::<EvermeetRelease>(layout::FFMPEG_MAC_INFO_URL, RequestOptions::default())
                .await
                .map(|release| release.version),
            Platform::Windows => self
                .client
                .text(
                    layout::FFMPEG_WINDOWS_VERSION_URL,
                    RequestOptions::default(),
                )
                .await
                .map(Some),
            Platform::Other => return None,
        };

        match result {
            Ok(version) => version
                .map(|version| version.trim().to_owned())
                .filter(|version| !version.is_empty()),
            Err(error) => {
                tracing::error!(%error, "could not read the latest ffmpeg release");
                None
            }
        }
    }

    /// Download and install ffmpeg and ffprobe.
    ///
    /// # Errors
    ///
    /// [`DownloaderError::InstallFailed`] on an unsupported platform or a
    /// malformed archive; [`DownloaderError::Io`] or
    /// [`DownloaderError::Http`] when a step fails. Every failure path removes
    /// the archives and any extraction directory it created.
    pub async fn install(&self, progress: Option<&dyn ProgressSink>) -> Result<()> {
        crate::bin::install::ensure_dir(&self.bin_dir).await?;

        match self.platform {
            Platform::MacOs => self.install_macos(progress).await,
            Platform::Windows => self.install_windows(progress).await,
            Platform::Other => Err(DownloaderError::InstallFailed {
                message: UNSUPPORTED_PLATFORM.to_owned(),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spawn::ProcessOutput;
    use crate::spawn::runner::LineSink;

    struct Fixed(ProcessOutput);

    #[async_trait::async_trait]
    impl ProcessRunner for Fixed {
        async fn run(
            &self,
            _spec: ProcessSpec,
            _lines: Option<&(dyn LineSink + '_)>,
            _cancel: &CancellationToken,
        ) -> std::result::Result<ProcessOutput, crate::spawn::ProcessError> {
            Ok(self.0.clone())
        }
    }

    fn manager(bin_dir: PathBuf, platform: Platform, banner: &str) -> FfmpegManager {
        FfmpegManager::new(
            bin_dir,
            platform,
            Arc::new(HttpClient::new().expect("the client builds")),
            Arc::new(Fixed(ProcessOutput {
                stdout: banner.to_owned(),
                ..ProcessOutput::default()
            })),
        )
    }

    async fn place_both(manager: &FfmpegManager) {
        tokio::fs::write(manager.ffmpeg_path(), b"binary")
            .await
            .expect("place ffmpeg");
        tokio::fs::write(manager.ffprobe_path(), b"binary")
            .await
            .expect("place ffprobe");
    }

    #[tokio::test]
    async fn both_binaries_must_be_present_to_count_as_installed() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(temp.path().to_path_buf(), Platform::MacOs, "");

        assert!(!manager.is_installed().await);

        tokio::fs::write(manager.ffmpeg_path(), b"binary")
            .await
            .expect("place ffmpeg");
        assert!(
            !manager.is_installed().await,
            "ffmpeg alone is not enough — yt-dlp's post-processing needs \
             ffprobe too"
        );

        tokio::fs::write(manager.ffprobe_path(), b"binary")
            .await
            .expect("place ffprobe");
        assert!(manager.is_installed().await);
    }

    #[tokio::test]
    async fn reads_the_version_out_of_a_release_banner() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(
            temp.path().to_path_buf(),
            Platform::MacOs,
            "ffmpeg version 7.1 Copyright (c) 2000-2024 the FFmpeg developers\n\
             built with Apple clang\n",
        );
        place_both(&manager).await;

        assert_eq!(manager.version().await, Some("7.1".to_owned()));
    }

    #[tokio::test]
    async fn reads_the_version_out_of_a_nightly_banner() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(
            temp.path().to_path_buf(),
            Platform::MacOs,
            "ffmpeg version N-113573-g4a2d1b0f9d Copyright (c) 2000-2024\n",
        );
        place_both(&manager).await;

        assert_eq!(
            manager.version().await,
            Some("N-113573-g4a2d1b0f9d".to_owned())
        );
    }

    #[tokio::test]
    async fn falls_back_to_the_whole_first_line_when_the_banner_is_unfamiliar() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(
            temp.path().to_path_buf(),
            Platform::MacOs,
            "  some other build banner  \nsecond line\n",
        );
        place_both(&manager).await;

        assert_eq!(
            manager.version().await,
            Some("some other build banner".to_owned())
        );
    }

    #[tokio::test]
    async fn an_absent_install_reports_no_version() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(
            temp.path().to_path_buf(),
            Platform::MacOs,
            "ffmpeg version 7.1",
        );

        assert_eq!(manager.version().await, None);
    }

    #[tokio::test]
    async fn a_platform_with_no_automatic_install_refuses_with_v1s_message() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(temp.path().to_path_buf(), Platform::Other, "");

        let error = manager.install(None).await.expect_err("nothing to install");

        assert_eq!(error.to_string(), UNSUPPORTED_PLATFORM);
    }

    #[tokio::test]
    async fn a_platform_with_no_automatic_install_reports_no_latest_version() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(temp.path().to_path_buf(), Platform::Other, "");

        assert_eq!(manager.latest_version().await, None);
    }
}
