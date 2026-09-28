//! The filesystem half of installing a managed binary.
//!
//! Three steps, each of which v1 got right and none of which is obvious:
//!
//! - **Download to `<name>.tmp`, then rename.** `rename` within a directory is
//!   atomic, so a failed or interrupted download never leaves a truncated
//!   `yt-dlp` in place of a working one. The rename is also why a stale `.tmp`
//!   is removed *before* the download rather than after a failure only.
//! - **`chmod 0755` before the rename**, not after. Between the two there is a
//!   window in which the final path exists; making the temporary file
//!   executable first means that window never contains a non-executable binary.
//! - **Strip the macOS quarantine attribute afterwards.** Gatekeeper refuses to
//!   run anything carrying `com.apple.quarantine`, which everything downloaded
//!   carries. `xattr -d` fails when the attribute is absent, and that failure is
//!   swallowed — v1 swallowed it too, and it is the normal case on a filesystem
//!   that does not support extended attributes at all.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio_util::sync::CancellationToken;

use crate::bin::layout::Platform;
use crate::error::{DownloaderError, Result};
use crate::spawn::{ProcessRunner, ProcessSpec, args};

/// How long `xattr` gets before it is killed. v1's value.
const XATTR_TIMEOUT: Duration = Duration::from_secs(5);

/// The temporary path a binary is downloaded to before being renamed into place.
///
/// Appended rather than substituted: `Path::with_extension` on `yt-dlp.exe`
/// would produce `yt-dlp.tmp` and lose the `.exe`, which on Windows is the
/// difference between an executable and a data file.
pub fn temporary_path(final_path: &Path) -> PathBuf {
    let mut name = OsString::from(final_path.as_os_str());
    name.push(".tmp");
    PathBuf::from(name)
}

/// A staging path beside `final_path` that no other install run shares.
///
/// `<name>.<run id>.tmp`: unique per run, so a stale file from a crashed run
/// and the file this run verifies can never be the same path. Appended, for
/// [`temporary_path`]'s reason.
pub fn staging_path(final_path: &Path) -> PathBuf {
    let mut name = OsString::from(final_path.as_os_str());
    name.push(format!(".{}", uuid::Uuid::new_v4().simple()));
    temporary_path(&PathBuf::from(name))
}

/// Remove every entry in `directory` whose name starts with `prefix` and ends
/// with `suffix`: staging left behind by runs that crashed.
///
/// Only called under the tool's install lock, so nothing it matches can belong
/// to a run still in progress.
pub async fn sweep(directory: &Path, prefix: &str, suffix: &str) {
    let Ok(mut entries) = tokio::fs::read_dir(directory).await else {
        return;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if name.starts_with(prefix) && name.ends_with(suffix) {
            let path = entry.path();
            if tokio::fs::metadata(&path)
                .await
                .is_ok_and(|meta| meta.is_dir())
            {
                remove_dir_quietly(&path).await;
            } else {
                remove_quietly(&path).await;
            }
        }
    }
}

/// Create `directory` and every missing parent.
///
/// # Errors
///
/// [`DownloaderError::Io`] when the directory cannot be created.
pub async fn ensure_dir(directory: &Path) -> Result<()> {
    tokio::fs::create_dir_all(directory)
        .await
        .map_err(|source| DownloaderError::Io {
            operation: "create the binary directory",
            path: directory.to_path_buf(),
            source,
        })
}

/// Delete `path`, ignoring the case where it was not there.
///
/// Used for cleanup on both the success and failure paths, where "it is already
/// gone" is the outcome being asked for rather than a problem.
pub async fn remove_quietly(path: &Path) {
    if let Err(error) = tokio::fs::remove_file(path).await
        && error.kind() != std::io::ErrorKind::NotFound
    {
        tracing::debug!(path = %path.display(), %error, "could not remove a temporary file");
    }
}

/// Delete `directory` and its contents, ignoring absence.
pub async fn remove_dir_quietly(directory: &Path) {
    if let Err(error) = tokio::fs::remove_dir_all(directory).await
        && error.kind() != std::io::ErrorKind::NotFound
    {
        tracing::debug!(
            path = %directory.display(),
            %error,
            "could not remove a temporary directory"
        );
    }
}

/// Make `path` executable on the platforms where that is a separate act.
///
/// Windows decides executability by extension, so this is a no-op there — the
/// same branch v1 had, for the same reason.
///
/// # Errors
///
/// [`DownloaderError::Io`] when the mode cannot be set.
pub async fn make_executable(path: &Path, platform: Platform) -> Result<()> {
    if platform == Platform::Windows {
        return Ok(());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        tokio::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
            .await
            .map_err(|source| DownloaderError::Io {
                operation: "make the downloaded binary executable",
                path: path.to_path_buf(),
                source,
            })
    }

    // A non-Windows, non-Unix target has no mode to set. Reachable only in a
    // cross-compile nobody ships.
    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(())
    }
}

/// Move a downloaded temporary file into its final place.
///
/// # Errors
///
/// [`DownloaderError::Io`] when the rename fails.
pub async fn promote(temporary: &Path, final_path: &Path) -> Result<()> {
    tokio::fs::rename(temporary, final_path)
        .await
        .map_err(|source| DownloaderError::Io {
            operation: "install the downloaded binary as",
            path: final_path.to_path_buf(),
            source,
        })
}

/// Remove the macOS quarantine attribute from every path, best effort.
///
/// Failures are logged and swallowed. `xattr -d` exits non-zero when the
/// attribute is not present, which is both common and harmless, and there is no
/// recovery to attempt: a binary that stays quarantined fails loudly at the
/// next spawn with a message the user can act on.
///
/// v1 wrapped *both* of its ffmpeg calls in one `try`, so a failure on ffmpeg
/// skipped ffprobe entirely. That is not reproduced — each path is attempted
/// independently, because skipping the second one leaves ffprobe unrunnable for
/// no reason the first failure implies.
pub async fn strip_quarantine(
    runner: &dyn ProcessRunner,
    paths: &[&Path],
    platform: Platform,
) -> usize {
    if platform != Platform::MacOs {
        return 0;
    }

    let cancel = CancellationToken::new();
    let mut stripped = 0;

    for path in paths {
        let spec = ProcessSpec::silent(PathBuf::from("xattr"), args::strip_quarantine(path))
            .with_timeout(XATTR_TIMEOUT);

        match runner.run(spec, None, &cancel).await {
            Ok(output) if output.code == 0 => {
                stripped += 1;
            }
            Ok(output) => {
                tracing::debug!(
                    path = %path.display(),
                    code = output.code,
                    "xattr found no quarantine attribute to remove"
                );
            }
            Err(error) => {
                tracing::debug!(path = %path.display(), %error, "could not run xattr");
            }
        }
    }

    stripped
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spawn::ProcessOutput;
    use crate::spawn::runner::LineSink;
    use std::sync::Mutex;

    /// A runner that records what it was asked to run and answers with a fixed
    /// exit code.
    struct ScriptedRunner {
        code: i32,
        calls: Mutex<Vec<(PathBuf, Vec<String>)>>,
    }

    impl ScriptedRunner {
        fn new(code: i32) -> Self {
            Self {
                code,
                calls: Mutex::new(Vec::new()),
            }
        }

        fn calls(&self) -> Vec<(PathBuf, Vec<String>)> {
            self.calls
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone()
        }
    }

    #[async_trait::async_trait]
    impl ProcessRunner for ScriptedRunner {
        async fn run(
            &self,
            spec: ProcessSpec,
            _lines: Option<&(dyn LineSink + '_)>,
            _cancel: &CancellationToken,
        ) -> std::result::Result<ProcessOutput, crate::spawn::ProcessError> {
            self.calls
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push((spec.program.clone(), spec.args.clone()));

            Ok(ProcessOutput {
                code: self.code,
                ..ProcessOutput::default()
            })
        }
    }

    #[test]
    fn the_temporary_path_appends_rather_than_replacing_the_extension() {
        assert_eq!(
            temporary_path(Path::new("/data/bin/yt-dlp.exe")),
            PathBuf::from("/data/bin/yt-dlp.exe.tmp"),
            "`with_extension` would yield `yt-dlp.tmp` and lose the `.exe` \
             Windows needs to treat the file as executable"
        );
        assert_eq!(
            temporary_path(Path::new("/data/bin/yt-dlp")),
            PathBuf::from("/data/bin/yt-dlp.tmp")
        );
    }

    #[test]
    fn every_staging_path_is_its_own() {
        let final_path = Path::new("/data/bin/yt-dlp.exe");
        let first = staging_path(final_path);
        let second = staging_path(final_path);

        assert_ne!(first, second, "two runs must never share a staged file");
        let name = first.to_string_lossy().into_owned();
        assert!(name.starts_with("/data/bin/yt-dlp.exe."));
        assert!(name.ends_with(".tmp"));
    }

    #[tokio::test]
    async fn sweeping_removes_only_matching_leftovers() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let dir = temp.path();
        tokio::fs::write(dir.join("yt-dlp.abc.tmp"), b"stale")
            .await
            .expect("write");
        tokio::fs::create_dir(dir.join("_ffmpeg_stage-abc"))
            .await
            .expect("mkdir");
        tokio::fs::write(dir.join("yt-dlp"), b"keep")
            .await
            .expect("write");

        sweep(dir, "yt-dlp.", ".tmp").await;
        sweep(dir, "_ffmpeg_stage", "").await;

        assert!(!dir.join("yt-dlp.abc.tmp").exists());
        assert!(!dir.join("_ffmpeg_stage-abc").exists());
        assert!(
            dir.join("yt-dlp").exists(),
            "the installed binary is untouched"
        );
    }

    #[tokio::test]
    async fn quarantine_stripping_runs_only_on_macos() {
        let runner = ScriptedRunner::new(0);
        let path = PathBuf::from("/data/bin/ffmpeg");

        assert_eq!(
            strip_quarantine(&runner, &[path.as_path()], Platform::Windows).await,
            0
        );
        assert!(
            runner.calls().is_empty(),
            "there is no quarantine attribute to remove off macOS"
        );
    }

    #[tokio::test]
    async fn quarantine_stripping_uses_an_argv_array() {
        let runner = ScriptedRunner::new(0);
        let ffmpeg = PathBuf::from("/data/bin/ffmpeg");
        let ffprobe = PathBuf::from("/data/bin/ffprobe");

        let stripped = strip_quarantine(
            &runner,
            &[ffmpeg.as_path(), ffprobe.as_path()],
            Platform::MacOs,
        )
        .await;

        assert_eq!(stripped, 2);
        assert_eq!(
            runner.calls(),
            vec![
                (
                    PathBuf::from("xattr"),
                    vec![
                        "-d".to_owned(),
                        "com.apple.quarantine".to_owned(),
                        "/data/bin/ffmpeg".to_owned(),
                    ]
                ),
                (
                    PathBuf::from("xattr"),
                    vec![
                        "-d".to_owned(),
                        "com.apple.quarantine".to_owned(),
                        "/data/bin/ffprobe".to_owned(),
                    ]
                ),
            ]
        );
    }

    #[tokio::test]
    async fn a_failing_xattr_is_swallowed_and_does_not_skip_the_next_path() {
        let runner = ScriptedRunner::new(1);
        let ffmpeg = PathBuf::from("/data/bin/ffmpeg");
        let ffprobe = PathBuf::from("/data/bin/ffprobe");

        let stripped = strip_quarantine(
            &runner,
            &[ffmpeg.as_path(), ffprobe.as_path()],
            Platform::MacOs,
        )
        .await;

        assert_eq!(stripped, 0, "neither attribute was there to remove");
        assert_eq!(
            runner.calls().len(),
            2,
            "v1 wrapped both calls in one try/catch, so a failure on ffmpeg \
             skipped ffprobe — deliberately not reproduced"
        );
    }

    #[tokio::test]
    async fn removing_an_absent_file_is_not_an_error() {
        let temp = tempfile::tempdir().expect("a temporary directory");

        remove_quietly(&temp.path().join("never-existed")).await;
        remove_dir_quietly(&temp.path().join("never-existed-either")).await;
    }

    #[tokio::test]
    async fn promoting_moves_the_temporary_file_into_place() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let temporary = temp.path().join("yt-dlp.tmp");
        let final_path = temp.path().join("yt-dlp");
        tokio::fs::write(&temporary, b"binary")
            .await
            .expect("write the temporary file");

        promote(&temporary, &final_path)
            .await
            .expect("the rename succeeds");

        assert!(!temporary.exists());
        assert_eq!(
            tokio::fs::read(&final_path).await.expect("read it back"),
            b"binary"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn making_a_binary_executable_sets_0755() {
        use std::os::unix::fs::PermissionsExt;

        let temp = tempfile::tempdir().expect("a temporary directory");
        let path = temp.path().join("yt-dlp");
        tokio::fs::write(&path, b"binary")
            .await
            .expect("write the file");

        make_executable(&path, Platform::MacOs)
            .await
            .expect("the mode is set");

        let mode = std::fs::metadata(&path)
            .expect("stat the file")
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o755);
    }
}
