//! The two ffmpeg install flows, and their progress arithmetic.
//!
//! Split from [`crate::bin::ffmpeg`] because the two platforms share nothing:
//! macOS downloads two single-binary archives from evermeet.cx and unpacks them;
//! Windows downloads one build archive from gyan.dev, verifies it, and has to go
//! looking inside it, because the binaries sit under a directory named for a
//! version that is not known until the archive is open. Both unpack into a
//! staging directory, and [`FfmpegManager::promote_staged`] swaps the pair in.
//!
//! # The progress numbers are v1's, exactly
//!
//! They look arbitrary and they are — but they are also what a user watching
//! the bar has already seen, and what v1's own test asserted. macOS reports
//! `23, 45, 46, 50, 73, 95, 96, 98, 100` for a pair of downloads that each
//! report 50 then 100; the download halves are scaled by 0.45 with the second
//! offset to 50, and the four flat values mark the extraction steps. Windows
//! scales its single download by 0.9 and marks 92, 96, 100.

use std::marker::PhantomData;
use std::path::{Path, PathBuf};

use crate::bin::archive;
use crate::bin::checksum;
use crate::bin::fetch::{ProgressSink, Scaled, download_text, download_to_file};
use crate::bin::ffmpeg::FfmpegManager;
use crate::bin::install;
use crate::bin::layout::{self, Platform};
use crate::bin::lock::InstallGuard;
use crate::error::{DownloaderError, Result};

use crate::bin::ffmpeg::ARCHIVE_INCOMPLETE;

/// The directory under `bin/` a new ffmpeg and ffprobe are staged in.
///
/// v1 unpacked straight over the installed binaries, so a failed extraction or
/// an interrupted run could leave one new binary beside one old one, or a
/// truncated one in place. Staging beside them and promoting both together
/// (see `bin::swap`) is what lets an unattended update fail without breaking
/// a working install.
const STAGE_DIR: &str = "_ffmpeg_stage";

/// Report `percent`, when anyone is listening.
fn mark(progress: Option<&dyn ProgressSink>, percent: u32) {
    if let Some(progress) = progress {
        progress.percent(percent);
    }
}

/// A verified ffmpeg and ffprobe pair waiting to be promoted.
///
/// `'g` is the borrow of the [`InstallGuard`] it was staged under, so it cannot
/// outlive that guard.
#[derive(Debug)]
pub struct StagedFfmpeg<'g> {
    pub(crate) dir: PathBuf,
    pub(crate) ffmpeg: PathBuf,
    pub(crate) ffprobe: PathBuf,
    /// What each staged binary hashed to at the end of staging, re-checked
    /// just before promotion. On Windows the archive was verified against
    /// gyan.dev's digest before extraction; on macOS there is no upstream
    /// digest, so this only guarantees the files did not change while staged.
    pub(crate) ffmpeg_digest: checksum::Sha256Digest,
    pub(crate) ffprobe_digest: checksum::Sha256Digest,
    pub(crate) _under: PhantomData<&'g ()>,
}

impl FfmpegManager {
    /// Download ffmpeg and ffprobe into a staging directory beside the
    /// installed pair, without touching it.
    ///
    /// # Integrity
    ///
    /// The Windows archive is checked against gyan.dev's published `.sha256`
    /// and refused on a mismatch. The macOS archives are **not** checked:
    /// evermeet.cx publishes an OpenPGP signature and no digest, and
    /// `bin::checksum` explains why that is not verified here.
    ///
    /// # Errors
    ///
    /// `InstallFailed` on an unsupported platform, a malformed archive or a
    /// failed checksum or a guard that is not from this manager's lock
    /// ([`crate::bin::lock::FOREIGN_GUARD`]); `Io` or `Http` when a step fails.
    /// The staging directory is removed on every failure.
    pub async fn stage<'g>(
        &self,
        guard: &'g InstallGuard<'_>,
        progress: Option<&dyn ProgressSink>,
    ) -> Result<StagedFfmpeg<'g>> {
        guard.check(&self.install_lock)?;

        if self.platform == Platform::Other {
            return Err(DownloaderError::InstallFailed {
                message: crate::bin::ffmpeg::UNSUPPORTED_PLATFORM.to_owned(),
            });
        }

        install::ensure_dir(&self.bin_dir).await?;
        // Runs that died half-way through left their staging behind. Under the
        // install lock, none of it can belong to a run still in progress.
        install::sweep(&self.bin_dir, STAGE_DIR, "").await;

        // A directory per run, so no two runs ever share staged files.
        let dir = self
            .bin_dir
            .join(format!("{STAGE_DIR}-{}", uuid::Uuid::new_v4().simple()));
        install::ensure_dir(&dir).await?;

        let ffmpeg = layout::ffmpeg_path(&dir, self.platform);
        let ffprobe = layout::ffprobe_path(&dir, self.platform);

        let result = match self.platform {
            Platform::Windows => self.stage_windows(&dir, &ffmpeg, &ffprobe, progress).await,
            Platform::MacOs | Platform::Other => {
                self.stage_macos(&dir, &ffmpeg, &ffprobe, progress).await
            }
        };
        let digests = match result {
            Ok(()) => self.finish_stage(&ffmpeg, &ffprobe).await,
            Err(error) => Err(error),
        };

        match digests {
            Ok((ffmpeg_digest, ffprobe_digest)) => {
                mark(progress, 100);
                Ok(StagedFfmpeg {
                    dir,
                    ffmpeg,
                    ffprobe,
                    ffmpeg_digest,
                    ffprobe_digest,
                    _under: PhantomData,
                })
            }
            Err(error) => {
                install::remove_dir_quietly(&dir).await;
                Err(error)
            }
        }
    }

    /// macOS: two archives from evermeet.cx, each holding one binary.
    async fn stage_macos(
        &self,
        dir: &Path,
        _ffmpeg: &Path,
        _ffprobe: &Path,
        progress: Option<&dyn ProgressSink>,
    ) -> Result<()> {
        let ffmpeg_zip = dir.join("ffmpeg.zip");
        let ffprobe_zip = dir.join("ffprobe.zip");

        tracing::info!(url = layout::FFMPEG_MAC_URL, "downloading ffmpeg");
        self.download_stage(layout::FFMPEG_MAC_URL, &ffmpeg_zip, progress, 0, 45.0)
            .await?;

        mark(progress, 46);
        archive::extract_all(&ffmpeg_zip, dir).await?;
        install::remove_quietly(&ffmpeg_zip).await;
        mark(progress, 50);

        tracing::info!(url = layout::FFPROBE_MAC_URL, "downloading ffprobe");
        self.download_stage(layout::FFPROBE_MAC_URL, &ffprobe_zip, progress, 50, 45.0)
            .await?;

        mark(progress, 96);
        archive::extract_all(&ffprobe_zip, dir).await?;
        install::remove_quietly(&ffprobe_zip).await;
        mark(progress, 98);
        Ok(())
    }

    /// Windows: one build archive from gyan.dev, verified, unpacked and
    /// searched.
    async fn stage_windows(
        &self,
        dir: &Path,
        ffmpeg: &Path,
        ffprobe: &Path,
        progress: Option<&dyn ProgressSink>,
    ) -> Result<()> {
        let zip = dir.join("ffmpeg-essentials.zip");
        let extract_dir = dir.join("extract");

        tracing::info!(url = layout::FFMPEG_WINDOWS_URL, "downloading ffmpeg");
        self.download_stage(layout::FFMPEG_WINDOWS_URL, &zip, progress, 0, 90.0)
            .await?;

        let expected = self.published_windows_digest().await?;
        checksum::verify_file(&zip, &expected).await?;

        mark(progress, 92);
        archive::extract_all(&zip, &extract_dir).await?;
        install::remove_quietly(&zip).await;
        mark(progress, 96);

        // The binaries live at `ffmpeg-<version>-essentials_build/bin/`, and
        // the version is only knowable once the archive is open.
        let found_ffmpeg = archive::find_file(&extract_dir, "ffmpeg.exe").await?;
        let found_ffprobe = archive::find_file(&extract_dir, "ffprobe.exe").await?;

        let (Some(found_ffmpeg), Some(found_ffprobe)) = (found_ffmpeg, found_ffprobe) else {
            return Err(DownloaderError::InstallFailed {
                message: ARCHIVE_INCOMPLETE.to_owned(),
            });
        };

        move_into_stage(&found_ffmpeg, ffmpeg).await?;
        move_into_stage(&found_ffprobe, ffprobe).await?;
        install::remove_dir_quietly(&extract_dir).await;
        Ok(())
    }

    /// The digest gyan.dev publishes for the essentials archive.
    ///
    /// Fetched after the archive rather than before, so the two name the same
    /// build except in the seconds after a new one is published. A release
    /// landing in that window fails the check and is refused, which is the
    /// safe direction; the next scheduled check picks it up.
    async fn published_windows_digest(&self) -> Result<checksum::Sha256Digest> {
        let document = download_text(&self.client, layout::FFMPEG_WINDOWS_SHA256_URL)
            .await
            .map_err(|error| DownloaderError::InstallFailed {
                message: format!("Could not download the published checksum: {error}"),
            })?;

        checksum::parse_bare(&document).ok_or_else(|| DownloaderError::InstallFailed {
            message: checksum::CHECKSUM_MISSING.to_owned(),
        })
    }

    /// Make the staged pair runnable, so the post-promotion probe can run it,
    /// and record what each binary hashes to for the check before promotion.
    async fn finish_stage(
        &self,
        ffmpeg: &Path,
        ffprobe: &Path,
    ) -> Result<(checksum::Sha256Digest, checksum::Sha256Digest)> {
        install::make_executable(ffmpeg, self.platform).await?;
        install::make_executable(ffprobe, self.platform).await?;
        install::strip_quarantine(self.runner.as_ref(), &[ffmpeg, ffprobe], self.platform).await;
        Ok((
            checksum::digest_file(ffmpeg).await?,
            checksum::digest_file(ffprobe).await?,
        ))
    }

    /// One download whose 0–100 maps onto `offset..=offset + span`.
    async fn download_stage(
        &self,
        url: &str,
        destination: &Path,
        progress: Option<&dyn ProgressSink>,
        offset: u32,
        span: f64,
    ) -> Result<()> {
        match progress {
            Some(progress) => {
                let scaled = Scaled::new(progress, offset, span);
                download_to_file(&self.client, url, destination, Some(&scaled)).await
            }
            None => download_to_file(&self.client, url, destination, None).await,
        }
    }
}

/// Move a file found in the extraction directory to its staged name.
///
/// A rename, not v1's copy: both paths are inside the staging directory, so
/// they share a volume and the rename is free where a copy of a 100 MB binary
/// is not.
async fn move_into_stage(from: &Path, to: &Path) -> Result<()> {
    tokio::fs::rename(from, to)
        .await
        .map_err(|source| DownloaderError::Io {
            operation: "stage the extracted binary as",
            path: to.to_path_buf(),
            source,
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bin::layout::Platform;
    use crate::spawn::runner::LineSink;
    use crate::spawn::{ProcessOutput, ProcessRunner, ProcessSpec};
    use shiranami_net::HttpClient;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};
    use tokio_util::sync::CancellationToken;

    struct NoRunner;

    #[async_trait::async_trait]
    impl ProcessRunner for NoRunner {
        async fn run(
            &self,
            _spec: ProcessSpec,
            _lines: Option<&(dyn LineSink + '_)>,
            _cancel: &CancellationToken,
        ) -> std::result::Result<ProcessOutput, crate::spawn::ProcessError> {
            Ok(ProcessOutput::default())
        }
    }

    #[derive(Default)]
    struct Recorder {
        seen: Mutex<Vec<u32>>,
    }

    impl Recorder {
        fn seen(&self) -> Vec<u32> {
            self.seen
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone()
        }
    }

    impl ProgressSink for Recorder {
        fn percent(&self, percent: u32) {
            self.seen
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(percent);
        }
    }

    fn manager(bin_dir: PathBuf, platform: Platform) -> FfmpegManager {
        FfmpegManager::new(
            bin_dir,
            platform,
            Arc::new(HttpClient::new().expect("the client builds")),
            Arc::new(NoRunner),
        )
    }

    /// The download stages are exercised end-to-end against a real server in
    /// `tests/binary_managers.rs`; here we only pin the arithmetic, which is
    /// the part that has to match a bar the user has already watched.
    #[test]
    fn the_macos_stage_scaling_reproduces_v1s_observed_sequence() {
        let recorder = Recorder::default();

        // The two download stages, each seeing 50 then 100 from the transfer.
        let ffmpeg = Scaled::new(&recorder, 0, 45.0);
        ffmpeg.percent(50);
        ffmpeg.percent(100);
        mark(Some(&recorder), 46);
        mark(Some(&recorder), 50);

        let ffprobe = Scaled::new(&recorder, 50, 45.0);
        ffprobe.percent(50);
        ffprobe.percent(100);
        mark(Some(&recorder), 96);
        mark(Some(&recorder), 98);
        mark(Some(&recorder), 100);

        assert_eq!(
            recorder.seen(),
            vec![23, 45, 46, 50, 73, 95, 96, 98, 100],
            "the exact sequence v1's ffmpeg-manager test observed"
        );
    }

    #[test]
    fn the_windows_stage_scaling_reproduces_v1s_ninety_percent_download() {
        let recorder = Recorder::default();

        let download = Scaled::new(&recorder, 0, 90.0);
        download.percent(50);
        download.percent(100);
        mark(Some(&recorder), 92);
        mark(Some(&recorder), 96);
        mark(Some(&recorder), 100);

        assert_eq!(recorder.seen(), vec![45, 90, 92, 96, 100]);
    }

    #[tokio::test]
    async fn a_windows_archive_missing_a_binary_fails_with_v1s_message() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let manager = manager(temp.path().to_path_buf(), Platform::Windows);

        // An extraction directory holding only one of the two binaries: the
        // shape a truncated or restructured gyan.dev build would produce.
        let extract_dir = temp
            .path()
            .join(format!("{STAGE_DIR}-test"))
            .join("extract");
        let nested = extract_dir.join("ffmpeg-7.1-essentials_build/bin");
        tokio::fs::create_dir_all(&nested)
            .await
            .expect("create the nested directory");
        tokio::fs::write(nested.join("ffmpeg.exe"), b"MZ")
            .await
            .expect("write one binary");

        let found_ffmpeg = archive::find_file(&extract_dir, "ffmpeg.exe")
            .await
            .expect("the search succeeds");
        let found_ffprobe = archive::find_file(&extract_dir, "ffprobe.exe")
            .await
            .expect("the search succeeds");

        assert!(found_ffmpeg.is_some());
        assert!(
            found_ffprobe.is_none(),
            "half an archive must not read as a complete install"
        );
        assert!(!manager.ffprobe_path().exists());
    }
}
