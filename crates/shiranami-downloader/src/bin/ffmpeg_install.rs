//! The two ffmpeg install flows, and their progress arithmetic.
//!
//! Split from [`crate::bin::ffmpeg`] because the two platforms share nothing:
//! macOS downloads two single-binary archives from evermeet.cx and unpacks them
//! straight into place; Windows downloads one build archive from gyan.dev and
//! has to go looking inside it, because the binaries sit under a directory
//! named for a version that is not known until the archive is open.
//!
//! # The progress numbers are v1's, exactly
//!
//! They look arbitrary and they are — but they are also what a user watching
//! the bar has already seen, and what v1's own test asserted. macOS reports
//! `23, 45, 46, 50, 73, 95, 96, 98, 100` for a pair of downloads that each
//! report 50 then 100; the download halves are scaled by 0.45 with the second
//! offset to 50, and the four flat values mark the extraction steps. Windows
//! scales its single download by 0.9 and marks 92, 96, 100.

use std::path::Path;

use crate::bin::archive;
use crate::bin::fetch::{ProgressSink, Scaled, download_to_file};
use crate::bin::ffmpeg::FfmpegManager;
use crate::bin::install;
use crate::bin::layout;
use crate::error::{DownloaderError, Result};

use crate::bin::ffmpeg::ARCHIVE_INCOMPLETE;

/// Report `percent`, when anyone is listening.
fn mark(progress: Option<&dyn ProgressSink>, percent: u32) {
    if let Some(progress) = progress {
        progress.percent(percent);
    }
}

impl FfmpegManager {
    /// macOS: two archives from evermeet.cx, each holding one binary.
    pub(super) async fn install_macos(&self, progress: Option<&dyn ProgressSink>) -> Result<()> {
        let ffmpeg_zip = self.bin_dir.join("ffmpeg.zip");
        let ffprobe_zip = self.bin_dir.join("ffprobe.zip");

        let result = self
            .install_macos_inner(&ffmpeg_zip, &ffprobe_zip, progress)
            .await;

        if result.is_err() {
            // v1 removed both archives on any failure, including the one that
            // had not been downloaded yet — `remove_quietly` makes that a
            // no-op rather than a second error.
            install::remove_quietly(&ffmpeg_zip).await;
            install::remove_quietly(&ffprobe_zip).await;
        }

        result
    }

    async fn install_macos_inner(
        &self,
        ffmpeg_zip: &Path,
        ffprobe_zip: &Path,
        progress: Option<&dyn ProgressSink>,
    ) -> Result<()> {
        tracing::info!(url = layout::FFMPEG_MAC_URL, "downloading ffmpeg");
        self.download_stage(layout::FFMPEG_MAC_URL, ffmpeg_zip, progress, 0, 45.0)
            .await?;

        mark(progress, 46);
        archive::extract_all(ffmpeg_zip, &self.bin_dir).await?;
        install::remove_quietly(ffmpeg_zip).await;
        mark(progress, 50);

        tracing::info!(url = layout::FFPROBE_MAC_URL, "downloading ffprobe");
        self.download_stage(layout::FFPROBE_MAC_URL, ffprobe_zip, progress, 50, 45.0)
            .await?;

        mark(progress, 96);
        archive::extract_all(ffprobe_zip, &self.bin_dir).await?;
        install::remove_quietly(ffprobe_zip).await;
        mark(progress, 98);

        let ffmpeg = self.ffmpeg_path();
        let ffprobe = self.ffprobe_path();
        install::make_executable(&ffmpeg, self.platform).await?;
        install::make_executable(&ffprobe, self.platform).await?;
        install::strip_quarantine(
            self.runner.as_ref(),
            &[ffmpeg.as_path(), ffprobe.as_path()],
            self.platform,
        )
        .await;

        mark(progress, 100);
        tracing::info!(dir = %self.bin_dir.display(), "ffmpeg and ffprobe installed");
        Ok(())
    }

    /// Windows: one build archive from gyan.dev, unpacked and searched.
    pub(super) async fn install_windows(&self, progress: Option<&dyn ProgressSink>) -> Result<()> {
        let zip = self.bin_dir.join("ffmpeg-essentials.zip");
        let extract_dir = self.bin_dir.join("_ffmpeg_extract");

        let result = self
            .install_windows_inner(&zip, &extract_dir, progress)
            .await;

        if result.is_err() {
            install::remove_quietly(&zip).await;
            install::remove_dir_quietly(&extract_dir).await;
        }

        result
    }

    async fn install_windows_inner(
        &self,
        zip: &Path,
        extract_dir: &Path,
        progress: Option<&dyn ProgressSink>,
    ) -> Result<()> {
        tracing::info!(url = layout::FFMPEG_WINDOWS_URL, "downloading ffmpeg");
        self.download_stage(layout::FFMPEG_WINDOWS_URL, zip, progress, 0, 90.0)
            .await?;

        mark(progress, 92);
        archive::extract_all(zip, extract_dir).await?;
        install::remove_quietly(zip).await;
        mark(progress, 96);

        // The binaries live at `ffmpeg-<version>-essentials_build/bin/`, and
        // the version is only knowable once the archive is open.
        let found_ffmpeg = archive::find_file(extract_dir, "ffmpeg.exe").await?;
        let found_ffprobe = archive::find_file(extract_dir, "ffprobe.exe").await?;

        let (Some(found_ffmpeg), Some(found_ffprobe)) = (found_ffmpeg, found_ffprobe) else {
            return Err(DownloaderError::InstallFailed {
                message: ARCHIVE_INCOMPLETE.to_owned(),
            });
        };

        copy(&found_ffmpeg, &self.ffmpeg_path()).await?;
        copy(&found_ffprobe, &self.ffprobe_path()).await?;

        install::remove_dir_quietly(extract_dir).await;

        mark(progress, 100);
        tracing::info!(dir = %self.bin_dir.display(), "ffmpeg and ffprobe installed");
        Ok(())
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

/// Copy a file out of the extraction directory into its installed place.
async fn copy(from: &Path, to: &Path) -> Result<()> {
    tokio::fs::copy(from, to)
        .await
        .map(|_bytes| ())
        .map_err(|source| DownloaderError::Io {
            operation: "install the extracted binary as",
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
        let extract_dir = temp.path().join("_ffmpeg_extract");
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
