//! The yt-dlp binary manager: where it is, what version it is, and how to
//! replace it.
//!
//! # Everything here answers "unknown" rather than failing
//!
//! [`YtDlpManager::version`] and [`YtDlpManager::latest_version`] both return
//! `Option<String>` and log rather than propagate. That is v1's shape and it is
//! deliberate: these two calls exist to render a settings panel, and a GitHub
//! rate-limit or an unreadable binary must show "unknown" beside a working
//! install rather than take the panel down. [`has_update`] then treats either
//! unknown as "no update", so a failed probe never prompts a reinstall.
//!
//! [`YtDlpManager::install`] is the opposite: it is a user-initiated action
//! with a visible outcome, so every failure propagates.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use reqwest::header::{ACCEPT, HeaderValue};
use serde::Deserialize;
use shiranami_net::{HttpClient, RequestOptions};
use tokio_util::sync::CancellationToken;

use crate::bin::fetch::{ProgressSink, download_to_file};
use crate::bin::install;
use crate::bin::layout::{self, Platform};
use crate::error::Result;
use crate::spawn::{ProcessRunner, ProcessSpec, args};

/// How long the version probe gets. v1's value.
const VERSION_TIMEOUT: Duration = Duration::from_secs(30);

/// The one field this crate reads from GitHub's latest-release document.
#[derive(Debug, Deserialize)]
struct LatestRelease {
    tag_name: Option<String>,
}

/// Locates, probes and installs yt-dlp.
pub struct YtDlpManager {
    bin_dir: PathBuf,
    platform: Platform,
    client: Arc<HttpClient>,
    runner: Arc<dyn ProcessRunner>,
}

impl YtDlpManager {
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

    /// Where the managed yt-dlp lives, whether or not it is there.
    pub fn path(&self) -> PathBuf {
        layout::yt_dlp_path(&self.bin_dir, self.platform)
    }

    /// Whether the binary is present.
    ///
    /// Existence only, as v1 checked. A present-but-corrupt binary surfaces at
    /// the next spawn, which is where a user can be told something actionable.
    pub async fn is_installed(&self) -> bool {
        tokio::fs::try_exists(self.path()).await.unwrap_or(false)
    }

    /// The installed version, or `None` when absent or unreadable.
    pub async fn version(&self) -> Option<String> {
        if !self.is_installed().await {
            return None;
        }

        let spec =
            ProcessSpec::capturing(self.path(), args::version()).with_timeout(VERSION_TIMEOUT);

        match self.runner.run(spec, None, &CancellationToken::new()).await {
            Ok(output) if output.code == 0 => {
                let version = output.stdout.trim();
                (!version.is_empty()).then(|| version.to_owned())
            }
            Ok(output) => {
                tracing::error!(code = output.code, "could not read the yt-dlp version");
                None
            }
            Err(error) => {
                tracing::error!(%error, "could not read the yt-dlp version");
                None
            }
        }
    }

    /// The newest published version, or `None` when GitHub cannot be reached.
    pub async fn latest_version(&self) -> Option<String> {
        // `Accept` pins the API version; the `User-Agent` GitHub actually
        // *requires* is set by `shiranami-net` for every request (Phase 3
        // amendment — v1 rode Chromium's invisibly and reqwest sends none).
        let options = RequestOptions::default().with_header(
            ACCEPT,
            HeaderValue::from_static("application/vnd.github+json"),
        );

        match self
            .client
            .json::<LatestRelease>(layout::YT_DLP_RELEASE_API, options)
            .await
        {
            Ok(release) => release
                .tag_name
                .map(|tag| tag.trim().to_owned())
                .filter(|tag| !tag.is_empty()),
            Err(error) => {
                tracing::error!(%error, "could not read the latest yt-dlp release");
                None
            }
        }
    }

    /// Download the platform's release asset and install it.
    ///
    /// # Errors
    ///
    /// [`crate::DownloaderError::Io`] or [`crate::DownloaderError::InstallFailed`]
    /// when any step fails. A failure removes the partial download, so the
    /// previously installed binary — if any — is left intact and runnable.
    pub async fn install(&self, progress: Option<&dyn ProgressSink>) -> Result<()> {
        let final_path = self.path();
        let temporary = install::temporary_path(&final_path);

        install::ensure_dir(&self.bin_dir).await?;

        // A previous run may have died between download and rename.
        install::remove_quietly(&temporary).await;

        let url = layout::yt_dlp_asset_url(self.platform);
        tracing::info!(%url, "downloading yt-dlp");

        if let Err(error) = self
            .write_and_promote(&url, &temporary, &final_path, progress)
            .await
        {
            install::remove_quietly(&temporary).await;
            return Err(error);
        }

        install::strip_quarantine(self.runner.as_ref(), &[final_path.as_path()], self.platform)
            .await;

        tracing::info!(path = %final_path.display(), "yt-dlp installed");
        Ok(())
    }

    /// The fallible middle of [`Self::install`], separated so one cleanup
    /// covers every step that can fail.
    async fn write_and_promote(
        &self,
        url: &str,
        temporary: &Path,
        final_path: &Path,
        progress: Option<&dyn ProgressSink>,
    ) -> Result<()> {
        download_to_file(&self.client, url, temporary, progress).await?;
        // Before the rename, so the final path never exists in a
        // non-executable state.
        install::make_executable(temporary, self.platform).await?;
        install::promote(temporary, final_path).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spawn::ProcessOutput;
    use crate::spawn::runner::LineSink;

    /// A runner answering one fixed result, for the version probe.
    struct Fixed(std::result::Result<ProcessOutput, crate::spawn::ProcessError>);

    #[async_trait::async_trait]
    impl ProcessRunner for Fixed {
        async fn run(
            &self,
            _spec: ProcessSpec,
            _lines: Option<&(dyn LineSink + '_)>,
            _cancel: &CancellationToken,
        ) -> std::result::Result<ProcessOutput, crate::spawn::ProcessError> {
            match &self.0 {
                Ok(output) => Ok(output.clone()),
                Err(_) => Err(crate::spawn::ProcessError::Spawn {
                    program: PathBuf::from("yt-dlp"),
                    source: std::io::Error::other("boom"),
                }),
            }
        }
    }

    fn manager(
        bin_dir: PathBuf,
        result: std::result::Result<ProcessOutput, crate::spawn::ProcessError>,
    ) -> YtDlpManager {
        YtDlpManager::new(
            bin_dir,
            Platform::MacOs,
            Arc::new(HttpClient::new().expect("the client builds")),
            Arc::new(Fixed(result)),
        )
    }

    fn output(stdout: &str, code: i32) -> ProcessOutput {
        ProcessOutput {
            stdout: stdout.to_owned(),
            code,
            ..ProcessOutput::default()
        }
    }

    #[tokio::test]
    async fn an_absent_binary_reports_no_version_without_spawning() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        // The runner would panic-free succeed if reached; absence must
        // short-circuit before it.
        let manager = manager(temp.path().to_path_buf(), Ok(output("2024.01.01\n", 0)));

        assert!(!manager.is_installed().await);
        assert_eq!(manager.version().await, None);
    }

    #[tokio::test]
    async fn an_installed_binary_reports_its_trimmed_version() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(temp.path().to_path_buf(), Ok(output("2024.01.01\n", 0)));
        tokio::fs::write(manager.path(), b"binary")
            .await
            .expect("place a binary");

        assert_eq!(manager.version().await, Some("2024.01.01".to_owned()));
    }

    #[tokio::test]
    async fn a_failing_version_probe_reports_unknown_rather_than_failing() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(
            temp.path().to_path_buf(),
            Err(crate::spawn::ProcessError::Cancelled),
        );
        tokio::fs::write(manager.path(), b"binary")
            .await
            .expect("place a binary");

        assert_eq!(
            manager.version().await,
            None,
            "the settings panel must render beside a broken probe, not fail"
        );
    }

    #[tokio::test]
    async fn a_non_zero_version_probe_reports_unknown() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(temp.path().to_path_buf(), Ok(output("", 1)));
        tokio::fs::write(manager.path(), b"binary")
            .await
            .expect("place a binary");

        assert_eq!(manager.version().await, None);
    }

    #[test]
    fn the_managed_path_follows_the_platform() {
        let client = Arc::new(HttpClient::new().expect("the client builds"));
        let runner: Arc<dyn ProcessRunner> = Arc::new(Fixed(Ok(ProcessOutput::default())));

        let windows = YtDlpManager::new(
            PathBuf::from("/data/bin"),
            Platform::Windows,
            Arc::clone(&client),
            Arc::clone(&runner),
        );
        assert_eq!(windows.path(), PathBuf::from("/data/bin/yt-dlp.exe"));

        let mac = YtDlpManager::new(PathBuf::from("/data/bin"), Platform::MacOs, client, runner);
        assert_eq!(mac.path(), PathBuf::from("/data/bin/yt-dlp"));
    }
}
