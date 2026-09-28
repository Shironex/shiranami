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
use crate::bin::layout::{self, Platform};
use crate::bin::{checksum, install, swap};
use crate::error::{DownloaderError, Result};
use crate::spawn::{ProcessRunner, ProcessSpec, args};

/// How long the version probe gets. v1's value.
const VERSION_TIMEOUT: Duration = Duration::from_secs(30);

/// What an install reports when the new binary does not answer `--version`.
pub const PROBE_FAILED: &str = "The new yt-dlp did not run, so the previous version was kept";

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
    /// The latest-release API document. [`layout::YT_DLP_RELEASE_API`] unless
    /// a test points it elsewhere.
    release_api: String,
    /// The releases root assets hang off. [`layout::YT_DLP_RELEASES`] unless a
    /// test points it elsewhere.
    releases: String,
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
            release_api: layout::YT_DLP_RELEASE_API.to_owned(),
            releases: layout::YT_DLP_RELEASES.to_owned(),
        }
    }

    /// Fetch from `release_api` and `releases` instead of GitHub.
    ///
    /// For tests, which bind a loopback server, and for nothing else: the
    /// production composition root never calls it, so the shipped upstream
    /// stays a compile-time constant (see `fetch`'s note on the SSRF guard).
    #[must_use]
    pub fn with_upstream(mut self, release_api: String, releases: String) -> Self {
        self.release_api = release_api;
        self.releases = releases;
        self
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
            .json::<LatestRelease>(&self.release_api, options)
            .await
        {
            Ok(release) => release
                .tag_name
                .map(|tag| tag.trim().to_owned())
                .filter(|tag| !tag.is_empty()),
            // Offline, or GitHub's unauthenticated rate limit: both expected,
            // and the caller already treats `None` as "unknown". A warning, not
            // an error, so a clean shutdown's log stays free of ERROR lines.
            Err(error) => {
                tracing::warn!(%error, "could not read the latest yt-dlp release");
                None
            }
        }
    }

    /// Download the platform's release asset, verify it, and install it.
    ///
    /// The manual install behind the settings panel's button. It goes through
    /// the same stage, verify, promote and probe path as an automatic update,
    /// so a manual install is checksum-verified too and can never leave a
    /// binary in place that does not run.
    ///
    /// # Errors
    ///
    /// Everything [`Self::stage`] and [`Self::promote_staged`] can fail with. A
    /// failure leaves the previously installed binary, if any, intact and
    /// runnable.
    pub async fn install(&self, progress: Option<&dyn ProgressSink>) -> Result<()> {
        let staged = self.stage(None, progress).await?;
        self.promote_staged(staged).await.map(|_version| ())
    }

    /// Download and verify a release asset beside the installed binary,
    /// without touching the installed binary.
    ///
    /// `tag` pins the release. An automatic update passes the tag it just read
    /// from the release API, so the asset and `SHA2-256SUMS` are guaranteed to
    /// come from the same release; a manual install passes `None` and follows
    /// `latest`, where a release landing between the two requests fails the
    /// checksum and is refused rather than installed.
    ///
    /// Staging is split from promotion so an automatic update can do the slow
    /// part (the download) while downloads are still running, and hold the
    /// queue only for the fast part (the renames).
    ///
    /// # Errors
    ///
    /// [`crate::DownloaderError::Http`] or `InstallFailed` when a download
    /// fails, `InstallFailed` carrying [`checksum::CHECKSUM_MISMATCH`] or
    /// [`checksum::CHECKSUM_MISSING`] when verification refuses the asset,
    /// `Io` when a filesystem step fails. The staged file is removed on every
    /// failure.
    pub async fn stage(
        &self,
        tag: Option<&str>,
        progress: Option<&dyn ProgressSink>,
    ) -> Result<StagedYtDlp> {
        let temporary = install::temporary_path(&self.path());

        install::ensure_dir(&self.bin_dir).await?;

        // A previous run may have died between download and rename.
        install::remove_quietly(&temporary).await;

        match self.write_and_verify(tag, &temporary, progress).await {
            Ok(()) => Ok(StagedYtDlp { path: temporary }),
            Err(error) => {
                install::remove_quietly(&temporary).await;
                Err(error)
            }
        }
    }

    /// Swap a staged binary in, keeping the old one until the new one answers
    /// `--version`.
    ///
    /// Returns the version the new binary reports.
    ///
    /// # Errors
    ///
    /// `Io` when a rename fails, and `InstallFailed` carrying
    /// [`PROBE_FAILED`] when the new binary does not run. Both leave the
    /// previous binary in place.
    pub async fn promote_staged(&self, staged: StagedYtDlp) -> Result<String> {
        let final_path = self.path();

        let promoted = match swap::promote_all(&[(staged.path.clone(), final_path.clone())]).await {
            Ok(promoted) => promoted,
            Err(error) => {
                install::remove_quietly(&staged.path).await;
                return Err(error);
            }
        };

        let Some(version) = self.version().await else {
            tracing::error!(path = %final_path.display(), "the new yt-dlp did not run; rolling back");
            swap::roll_back(&promoted).await;
            return Err(DownloaderError::InstallFailed {
                message: PROBE_FAILED.to_owned(),
            });
        };

        swap::commit(&promoted).await;
        tracing::info!(path = %final_path.display(), version, "yt-dlp installed");
        Ok(version)
    }

    /// Throw a staged binary away, for an update that will not be promoted.
    pub async fn discard(&self, staged: StagedYtDlp) {
        install::remove_quietly(&staged.path).await;
    }

    /// The fallible middle of [`Self::stage`], separated so one cleanup covers
    /// every step that can fail.
    async fn write_and_verify(
        &self,
        tag: Option<&str>,
        temporary: &Path,
        progress: Option<&dyn ProgressSink>,
    ) -> Result<()> {
        let asset = layout::yt_dlp_asset_name(self.platform);
        let url = layout::yt_dlp_release_file_url(&self.releases, tag, asset);
        tracing::info!(%url, "downloading yt-dlp");
        download_to_file(&self.client, &url, temporary, progress).await?;

        let expected = self.published_digest(tag, asset).await?;
        checksum::verify_file(temporary, &expected).await?;

        // Before the rename, so the final path never exists in a
        // non-executable state, and before the probe, which has to be able to
        // run it.
        install::make_executable(temporary, self.platform).await?;
        install::strip_quarantine(self.runner.as_ref(), &[temporary], self.platform).await;
        Ok(())
    }

    /// The digest the release publishes for `asset`.
    async fn published_digest(
        &self,
        tag: Option<&str>,
        asset: &str,
    ) -> Result<checksum::Sha256Digest> {
        let url = layout::yt_dlp_release_file_url(&self.releases, tag, checksum::YT_DLP_SUMS_FILE);
        let document = self
            .client
            .text(&url, RequestOptions::default())
            .await
            // `InstallFailed` rather than `Http`: this message reaches the
            // settings panel verbatim, and `Http` projects onto `INTERNAL`.
            .map_err(|error| DownloaderError::InstallFailed {
                message: format!("Could not download the published checksum: {error}"),
            })?;

        checksum::parse_sums(&document, asset).ok_or_else(|| DownloaderError::InstallFailed {
            message: checksum::CHECKSUM_MISSING.to_owned(),
        })
    }
}

/// A verified yt-dlp waiting beside the installed one to be promoted.
///
/// Deliberately not `Clone`: it names one file, and promoting or discarding it
/// consumes it.
#[derive(Debug)]
pub struct StagedYtDlp {
    path: PathBuf,
}

impl StagedYtDlp {
    /// Where the staged binary is.
    pub fn path(&self) -> &Path {
        &self.path
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
