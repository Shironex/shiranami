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

use std::marker::PhantomData;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use reqwest::header::{ACCEPT, HeaderValue};
use serde::Deserialize;
use shiranami_net::{HttpClient, RequestOptions};
use tokio_util::sync::CancellationToken;

use crate::bin::fetch::{ProgressSink, download_text, download_to_file};
use crate::bin::layout::{self, Platform};
use crate::bin::lock::{InstallGuard, InstallLock};
use crate::bin::{checksum, install, swap};
use crate::error::{DownloaderError, Result};
use crate::spawn::{ProcessRunner, ProcessSpec, args};

/// How long the version probe gets. v1's value.
const VERSION_TIMEOUT: Duration = Duration::from_secs(30);

/// How long the probe right after an install gets.
///
/// Twice [`VERSION_TIMEOUT`], and only here. `yt-dlp_macos` is a PyInstaller
/// bundle that unpacks itself on first run, and on a machine under load that
/// first `--version` was measured at 33 s. A false failure here is expensive
/// (it rolls back a good update), while waiting longer costs nothing but
/// time on a background task. The settings panel's probe keeps v1's 30 s.
pub const POST_INSTALL_PROBE_TIMEOUT: Duration = Duration::from_secs(60);

/// What an install reports when the new binary does not answer `--version`.
pub const PROBE_FAILED: &str = "The new yt-dlp did not run, so the previous version was kept";

/// What an install reports when the new binary did not run **and** the
/// previous one could not be put back.
pub const PROBE_FAILED_UNRESTORED: &str = "The new yt-dlp did not run, and the previous version \
     could not be restored. Install yt-dlp again from Settings, Downloads";

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
    /// One install at a time; see `bin::lock`.
    install_lock: InstallLock,
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
            install_lock: InstallLock::default(),
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
    ///
    /// First rolls back a swap a crash left unfinished (see [`swap::recover`];
    /// only when its marker is on disk and no install is running), so a tool
    /// that was mid-update when the app died reads as its previous version
    /// rather than as missing. Every status check and the boot-time status
    /// refresh come through here.
    pub async fn is_installed(&self) -> bool {
        let finals = [self.path()];
        // The marker check first, so an ordinary status read never touches
        // the lock (and never shows as an install in progress).
        if swap::is_pending(&finals).await
            && let Some(_idle) = self.install_lock.try_lock()
        {
            swap::recover(&finals).await;
        }
        tokio::fs::try_exists(self.path()).await.unwrap_or(false)
    }

    /// Wait for any install of yt-dlp in progress, then hold the lock.
    pub async fn lock_install(&self) -> InstallGuard<'_> {
        self.install_lock.lock().await
    }

    /// Whether an install of yt-dlp is in progress, manual or automatic.
    pub fn is_installing(&self) -> bool {
        self.install_lock.is_held()
    }

    /// The installed version, or `None` when absent or unreadable.
    pub async fn version(&self) -> Option<String> {
        self.version_within(VERSION_TIMEOUT).await
    }

    async fn version_within(&self, timeout: Duration) -> Option<String> {
        if !self.is_installed().await {
            return None;
        }

        let spec = ProcessSpec::capturing(self.path(), args::version()).with_timeout(timeout);

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
            Ok(release) => {
                let tag = release.tag_name.map(|tag| tag.trim().to_owned())?;
                if layout::is_release_tag(&tag) {
                    return Some(tag);
                }
                // It goes into a URL path next. Anything but a plain tag is
                // refused here, so it never reaches one.
                tracing::warn!(tag, "refusing a yt-dlp release tag that is not a plain tag");
                None
            }
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
    /// the same lock, stage, verify, promote and probe path as an automatic
    /// update, so a manual install is checksum-verified too, can never leave a
    /// binary in place that does not run, and waits for an automatic update
    /// already in progress rather than racing it.
    ///
    /// # Errors
    ///
    /// Everything [`Self::stage`] and [`Self::promote_staged`] can fail with. A
    /// failure leaves the previously installed binary, if any, intact and
    /// runnable, except where [`PROBE_FAILED_UNRESTORED`] says otherwise.
    pub async fn install(&self, progress: Option<&dyn ProgressSink>) -> Result<()> {
        let guard = self.lock_install().await;
        let staged = self.stage(&guard, None, progress).await?;
        self.promote_staged(&guard, staged).await.map(|_version| ())
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
    /// queue only for the fast part (the renames). Both halves take the
    /// install guard and refuse one from any other lock, and the staged handle
    /// borrows the guard, so it cannot be promoted after the guard is dropped.
    ///
    /// # Errors
    ///
    /// [`crate::DownloaderError::Http`] or `InstallFailed` when a download
    /// fails or the tag is not a plain tag, `InstallFailed` carrying
    /// [`checksum::CHECKSUM_MISMATCH`] or [`checksum::CHECKSUM_MISSING`] when
    /// verification refuses the asset, `Io` when a filesystem step fails,
    /// `InstallFailed` carrying [`crate::bin::lock::FOREIGN_GUARD`] for a guard
    /// that is not from this manager's lock. The staged file is removed on
    /// every failure.
    pub async fn stage<'g>(
        &self,
        guard: &'g InstallGuard<'_>,
        tag: Option<&str>,
        progress: Option<&dyn ProgressSink>,
    ) -> Result<StagedYtDlp<'g>> {
        guard.check(&self.install_lock)?;

        if let Some(tag) = tag
            && !layout::is_release_tag(tag)
        {
            return Err(DownloaderError::InstallFailed {
                message: format!("Refused a yt-dlp release tag that is not a plain tag: {tag}"),
            });
        }

        install::ensure_dir(&self.bin_dir).await?;

        // Runs that died before promoting left their staging behind. Under the
        // lock, nothing matching can belong to a run still in progress.
        let final_name = layout::yt_dlp_path(Path::new(""), self.platform);
        let prefix = format!("{}.", final_name.to_string_lossy());
        install::sweep(&self.bin_dir, &prefix, ".tmp").await;

        let staging = install::staging_path(&self.path());
        match self.write_and_verify(tag, &staging, progress).await {
            Ok(digest) => Ok(StagedYtDlp {
                path: staging,
                digest,
                _under: PhantomData,
            }),
            Err(error) => {
                install::remove_quietly(&staging).await;
                Err(error)
            }
        }
    }

    /// Swap a staged binary in, keeping the old one until the new one answers
    /// `--version`.
    ///
    /// The staged file is checked against its digest once more immediately
    /// before the rename: an automatic update may have waited up to half an
    /// hour for the download queue between staging and here, and whatever sits
    /// at that path now is what gets executed next.
    ///
    /// Returns the version the new binary reports.
    ///
    /// # Errors
    ///
    /// `InstallFailed` carrying [`checksum::CHECKSUM_MISMATCH`] when the staged
    /// file changed since it was verified, `Io` when a rename fails, and
    /// `InstallFailed` carrying [`PROBE_FAILED`] (or
    /// [`PROBE_FAILED_UNRESTORED`], when putting the old one back failed too)
    /// when the new binary does not run.
    pub async fn promote_staged(
        &self,
        guard: &InstallGuard<'_>,
        staged: StagedYtDlp<'_>,
    ) -> Result<String> {
        if let Err(error) = guard.check(&self.install_lock) {
            install::remove_quietly(&staged.path).await;
            return Err(error);
        }
        let final_path = self.path();

        if let Err(error) = checksum::verify_file(&staged.path, &staged.digest).await {
            tracing::error!(path = %staged.path.display(), "the staged yt-dlp changed after it was verified");
            install::remove_quietly(&staged.path).await;
            return Err(error);
        }

        let promoted = match swap::promote_all(&[(staged.path.clone(), final_path.clone())]).await {
            Ok(promoted) => promoted,
            Err(error) => {
                install::remove_quietly(&staged.path).await;
                return Err(error);
            }
        };

        let Some(version) = self.version_within(POST_INSTALL_PROBE_TIMEOUT).await else {
            tracing::error!(path = %final_path.display(), "the new yt-dlp did not run; rolling back");
            let restored = swap::roll_back(&promoted).await;
            return Err(DownloaderError::InstallFailed {
                message: if restored {
                    PROBE_FAILED
                } else {
                    PROBE_FAILED_UNRESTORED
                }
                .to_owned(),
            });
        };

        swap::commit(&promoted).await;
        tracing::info!(path = %final_path.display(), version, "yt-dlp installed");
        Ok(version)
    }

    /// Throw a staged binary away, for an update that will not be promoted.
    pub async fn discard(&self, staged: StagedYtDlp<'_>) {
        install::remove_quietly(&staged.path).await;
    }

    /// The fallible middle of [`Self::stage`], separated so one cleanup covers
    /// every step that can fail. Answers the verified digest.
    async fn write_and_verify(
        &self,
        tag: Option<&str>,
        staging: &Path,
        progress: Option<&dyn ProgressSink>,
    ) -> Result<checksum::Sha256Digest> {
        let asset = layout::yt_dlp_asset_name(self.platform);
        let url = layout::yt_dlp_release_file_url(&self.releases, tag, asset);
        tracing::info!(%url, "downloading yt-dlp");
        download_to_file(&self.client, &url, staging, progress).await?;

        let expected = self.published_digest(tag, asset).await?;
        checksum::verify_file(staging, &expected).await?;

        // Before the rename, so the final path never exists in a
        // non-executable state, and before the probe, which has to be able to
        // run it. Neither changes the file's bytes, so the digest still holds.
        install::make_executable(staging, self.platform).await?;
        install::strip_quarantine(self.runner.as_ref(), &[staging], self.platform).await;
        Ok(expected)
    }

    /// The digest the release publishes for `asset`.
    async fn published_digest(
        &self,
        tag: Option<&str>,
        asset: &str,
    ) -> Result<checksum::Sha256Digest> {
        let url = layout::yt_dlp_release_file_url(&self.releases, tag, checksum::YT_DLP_SUMS_FILE);
        let document = download_text(&self.client, &url)
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
/// consumes it. `'g` is the borrow of the [`InstallGuard`] it was staged under,
/// so the compiler refuses to let it outlive that guard.
#[derive(Debug)]
pub struct StagedYtDlp<'g> {
    path: PathBuf,
    /// What the file hashed to when it was verified.
    digest: checksum::Sha256Digest,
    _under: PhantomData<&'g ()>,
}

impl StagedYtDlp<'_> {
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

    /// A guard only proves "yt-dlp's lock is held" because the manager checks
    /// where it came from: a fresh lock's guard and ffmpeg's are both refused,
    /// before anything is downloaded.
    #[tokio::test]
    async fn a_guard_from_another_lock_is_refused() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(temp.path().to_path_buf(), Ok(output("", 0)));

        let stranger = InstallLock::default();
        let foreign = stranger.lock().await;
        let error = manager
            .stage(&foreign, Some("2026.09.20"), None)
            .await
            .expect_err("a fresh lock's guard");
        assert_eq!(error.to_string(), crate::bin::lock::FOREIGN_GUARD);

        let ffmpeg = crate::bin::FfmpegManager::new(
            temp.path().to_path_buf(),
            Platform::MacOs,
            Arc::new(HttpClient::new().expect("the client builds")),
            Arc::new(Fixed(Ok(output("", 0)))),
        );
        let ffmpegs = ffmpeg.lock_install().await;
        let error = manager
            .stage(&ffmpegs, Some("2026.09.20"), None)
            .await
            .expect_err("another tool's guard");
        assert_eq!(error.to_string(), crate::bin::lock::FOREIGN_GUARD);

        let own = manager.lock_install().await;
        assert!(own.check(&manager.install_lock).is_ok());
        assert!(
            manager.stage(&own, Some("../x"), None).await.is_err(),
            "the tag goes into a URL path, so only a plain tag is staged"
        );
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
