//! Unpacking a downloaded archive.
//!
//! This module is the whole of architecture §2.2 #19's "the `zip` crate deletes
//! the 3-tier Windows extraction fallback". v1 needed three attempts because
//! Node had no zip reader it trusted: a worker thread tried `adm-zip`, then
//! shelled out to `tar`, then shelled out to PowerShell — and on macOS a
//! fourth path shelled out to `unzip`. Four ways to extract a file, three of
//! them spawning a process that may not exist on a Finder-launched `PATH`
//! (R19), and one of them constructing a PowerShell command line.
//!
//! All four collapse into one in-process reader. The Windows worker thread goes
//! with them: `spawn_blocking` is what keeps decompression off the async
//! runtime, and it needs no message protocol to report failure.
//!
//! # Zip slip
//!
//! An archive entry named `../../../../etc/cron.d/x` writes outside the
//! destination on any extractor that joins entry names naively. v1's PowerShell
//! and `tar` paths could not defend against this at all. Here every entry goes
//! through `enclosed_name`, which returns `None` for anything containing `..`
//! or an absolute root, and such an entry is skipped rather than written.

use std::path::{Path, PathBuf};

use crate::error::{DownloaderError, Result};

/// Extract every entry of `archive` under `destination`.
///
/// Runs on a blocking thread: decompressing a 90 MB ffmpeg build is CPU-bound
/// work that would otherwise stall every other task on the runtime worker.
///
/// # Errors
///
/// [`DownloaderError::Archive`] when the archive cannot be read,
/// [`DownloaderError::Io`] when an entry cannot be written.
pub async fn extract_all(archive: &Path, destination: &Path) -> Result<()> {
    let archive = archive.to_path_buf();
    let destination = destination.to_path_buf();

    tokio::task::spawn_blocking(move || extract_all_blocking(&archive, &destination))
        .await
        .map_err(|error| DownloaderError::InstallFailed {
            message: format!("extraction task failed: {error}"),
        })?
}

fn extract_all_blocking(archive: &Path, destination: &Path) -> Result<()> {
    let file = std::fs::File::open(archive).map_err(|source| DownloaderError::Io {
        operation: "open the downloaded archive",
        path: archive.to_path_buf(),
        source,
    })?;

    let mut zip = zip::ZipArchive::new(file).map_err(|source| DownloaderError::Archive {
        path: archive.to_path_buf(),
        source,
    })?;

    std::fs::create_dir_all(destination).map_err(|source| DownloaderError::Io {
        operation: "create the extraction directory",
        path: destination.to_path_buf(),
        source,
    })?;

    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|source| DownloaderError::Archive {
                path: archive.to_path_buf(),
                source,
            })?;

        // `None` means the entry name escapes its own archive — `..`, an
        // absolute path, or a Windows drive letter. Skipped, never written.
        let Some(relative) = entry.enclosed_name() else {
            tracing::warn!(
                archive = %archive.display(),
                entry = entry.name(),
                "skipped an archive entry whose path escapes the destination"
            );
            continue;
        };

        let target = destination.join(relative);

        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|source| DownloaderError::Io {
                operation: "create an extracted directory",
                path: target.clone(),
                source,
            })?;
            continue;
        }

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|source| DownloaderError::Io {
                operation: "create an extracted directory",
                path: parent.to_path_buf(),
                source,
            })?;
        }

        let mut out = std::fs::File::create(&target).map_err(|source| DownloaderError::Io {
            operation: "write an extracted file",
            path: target.clone(),
            source,
        })?;

        std::io::copy(&mut entry, &mut out).map_err(|source| DownloaderError::Io {
            operation: "write an extracted file",
            path: target.clone(),
            source,
        })?;
    }

    Ok(())
}

/// Find `name` anywhere under `directory`, case-insensitively.
///
/// The gyan.dev archive nests its binaries at
/// `ffmpeg-<version>-essentials_build/bin/ffmpeg.exe`, and the version is in
/// the path, so the location cannot be hard-coded. v1 walked the tree for the
/// same reason and matched case-insensitively; that is kept, because the
/// comparison has to hold on a case-sensitive filesystem too.
///
/// # Errors
///
/// [`DownloaderError::Io`] when a directory cannot be read.
pub async fn find_file(directory: &Path, name: &str) -> Result<Option<PathBuf>> {
    let directory = directory.to_path_buf();
    let name = name.to_owned();

    tokio::task::spawn_blocking(move || find_file_blocking(&directory, &name))
        .await
        .map_err(|error| DownloaderError::InstallFailed {
            message: format!("archive search task failed: {error}"),
        })?
}

fn find_file_blocking(directory: &Path, name: &str) -> Result<Option<PathBuf>> {
    let entries = std::fs::read_dir(directory).map_err(|source| DownloaderError::Io {
        operation: "read the extracted directory",
        path: directory.to_path_buf(),
        source,
    })?;

    let mut directories = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|source| DownloaderError::Io {
            operation: "read the extracted directory",
            path: directory.to_path_buf(),
            source,
        })?;

        let path = entry.path();
        let file_type = entry.file_type().map_err(|source| DownloaderError::Io {
            operation: "inspect an extracted entry",
            path: path.clone(),
            source,
        })?;

        if file_type.is_file() {
            if entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case(name)
            {
                return Ok(Some(path));
            }
        } else if file_type.is_dir() {
            directories.push(path);
        }
    }

    // Files before directories, so a match in the current directory wins over
    // one nested below it — v1's ordering, which matters for an archive that
    // ships both a top-level and a nested copy.
    for nested in directories {
        if let Some(found) = find_file_blocking(&nested, name)? {
            return Ok(Some(found));
        }
    }

    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Build a zip in memory containing `entries`, and write it to `path`.
    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).expect("create the fixture archive");
        let mut writer = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for (name, body) in entries {
            writer
                .start_file(*name, options)
                .expect("start a fixture entry");
            writer.write_all(body).expect("write a fixture entry");
        }

        writer.finish().expect("finish the fixture archive");
    }

    #[tokio::test]
    async fn extracts_a_nested_archive_preserving_its_directories() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let archive = temp.path().join("build.zip");
        let destination = temp.path().join("out");

        write_zip(
            &archive,
            &[
                ("ffmpeg-7.1-essentials_build/bin/ffmpeg.exe", b"MZ-ffmpeg"),
                ("ffmpeg-7.1-essentials_build/bin/ffprobe.exe", b"MZ-ffprobe"),
                ("ffmpeg-7.1-essentials_build/README.txt", b"hello"),
            ],
        );

        extract_all(&archive, &destination)
            .await
            .expect("the archive extracts");

        let extracted = destination.join("ffmpeg-7.1-essentials_build/bin/ffmpeg.exe");
        assert_eq!(
            std::fs::read(&extracted).expect("the entry was written"),
            b"MZ-ffmpeg"
        );
    }

    #[tokio::test]
    async fn an_entry_escaping_the_destination_is_skipped_not_written() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let archive = temp.path().join("evil.zip");
        let destination = temp.path().join("out");

        write_zip(
            &archive,
            &[("../escaped.txt", b"pwned"), ("legit.txt", b"fine")],
        );

        extract_all(&archive, &destination)
            .await
            .expect("extraction succeeds, skipping the hostile entry");

        assert!(
            !temp.path().join("escaped.txt").exists(),
            "zip slip: an entry named `../escaped.txt` must never be written \
             outside the destination"
        );
        assert!(
            destination.join("legit.txt").exists(),
            "the well-behaved entry beside it still extracts"
        );
    }

    #[tokio::test]
    async fn finds_a_binary_nested_under_a_version_named_directory() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let nested = temp.path().join("ffmpeg-7.1-essentials_build/bin");
        std::fs::create_dir_all(&nested).expect("create the nested directory");
        std::fs::write(nested.join("ffmpeg.exe"), b"MZ").expect("write the binary");

        let found = find_file(temp.path(), "ffmpeg.exe")
            .await
            .expect("the search succeeds")
            .expect("the binary is found");

        assert_eq!(found, nested.join("ffmpeg.exe"));
    }

    #[tokio::test]
    async fn the_search_is_case_insensitive() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        std::fs::write(temp.path().join("FFmpeg.EXE"), b"MZ").expect("write the binary");

        assert!(
            find_file(temp.path(), "ffmpeg.exe")
                .await
                .expect("the search succeeds")
                .is_some()
        );
    }

    #[tokio::test]
    async fn a_missing_binary_is_absence_not_failure() {
        let temp = tempfile::tempdir().expect("a temporary directory");

        assert!(
            find_file(temp.path(), "ffmpeg.exe")
                .await
                .expect("the search succeeds")
                .is_none(),
            "an archive without the binary is a `None` the caller turns into \
             v1's own message, not an io error from the walk"
        );
    }
}
