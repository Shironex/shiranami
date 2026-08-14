//! Where finished downloads land.
//!
//! Three facts the settings panel needs — the active directory, the default it
//! would use with no configuration, and whether those are the same — plus the
//! rules for setting it.
//!
//! # `Shiranami Downloads` is a frozen name
//!
//! It is the directory users already have, already added to their watched
//! folders, and already have tracks in. Renaming it would silently point the
//! app at an empty folder and orphan everything downloaded before the upgrade.
//!
//! # Setting it to the default clears the setting rather than storing it
//!
//! v1 did this and it is worth keeping: a user who navigates back to the
//! default directory should be *unconfigured*, not configured-to-a-path that
//! happens to match today. Otherwise moving the music folder later leaves them
//! pinned to the old absolute path with no indication why.

use std::path::{Path, PathBuf};

use shiranami_core::models::DownloadLocation;

use crate::error::{DownloaderError, Result};

/// The folder created inside the user's music directory.
pub const DOWNLOADS_FOLDER: &str = "Shiranami Downloads";

/// The directory downloads go to with no configuration.
pub fn default_dir(music_dir: &Path) -> PathBuf {
    music_dir.join(DOWNLOADS_FOLDER)
}

/// Normalise a renderer-supplied path into a stored one.
///
/// Returns `None` for anything blank, which the caller turns into "clear the
/// setting". Whitespace is trimmed first: a path pasted with a trailing space
/// is a blank-looking setting that would otherwise be stored and then fail to
/// resolve.
pub fn normalize_configured(configured: Option<&str>) -> Option<PathBuf> {
    let trimmed = configured?.trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(absolute(Path::new(trimmed)))
}

/// The active directory, without creating anything.
///
/// Exposed separately because the folders cache needs the configured location
/// and must not have directory creation as a side effect of asking for it.
pub fn active_dir(music_dir: &Path, configured: Option<&str>) -> PathBuf {
    normalize_configured(configured).unwrap_or_else(|| default_dir(music_dir))
}

/// Whether `candidate` names the same directory as the default.
///
/// Compared after normalisation, so a trailing separator or a `.` segment does
/// not read as a different directory.
pub fn is_default(music_dir: &Path, candidate: &Path) -> bool {
    normalize_for_compare(candidate) == normalize_for_compare(&default_dir(music_dir))
}

/// The full state the settings panel renders, creating the directory.
///
/// # Errors
///
/// [`DownloaderError::Io`] when the directory cannot be created.
pub async fn state(music_dir: &Path, configured: Option<&str>) -> Result<DownloadLocation> {
    let selected = active_dir(music_dir, configured);
    let default = default_dir(music_dir);

    ensure(&selected).await?;

    Ok(DownloadLocation {
        path: selected.to_string_lossy().into_owned(),
        default_path: default.to_string_lossy().into_owned(),
        is_default: is_default(music_dir, &selected),
    })
}

/// Create `directory` and every missing parent.
///
/// # Errors
///
/// [`DownloaderError::Io`] when it cannot be created.
pub async fn ensure(directory: &Path) -> Result<()> {
    tokio::fs::create_dir_all(directory)
        .await
        .map_err(|source| DownloaderError::Io {
            operation: "create the downloads directory",
            path: directory.to_path_buf(),
            source,
        })
}

/// Make a path absolute without requiring it to exist.
///
/// `canonicalize` would be wrong here: the directory may not have been created
/// yet, and on Windows it returns a `\\?\` extended-length prefix that the
/// renderer would then display.
fn absolute(path: &Path) -> PathBuf {
    if path.is_absolute() {
        return path.to_path_buf();
    }

    std::env::current_dir()
        .map(|cwd| cwd.join(path))
        .unwrap_or_else(|_| path.to_path_buf())
}

/// Drop trailing separators and `.` segments, for comparison only.
fn normalize_for_compare(path: &Path) -> PathBuf {
    path.components().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn music() -> PathBuf {
        PathBuf::from("/Users/x/Music")
    }

    #[test]
    fn the_default_directory_is_the_frozen_folder_name() {
        assert_eq!(
            default_dir(&music()),
            PathBuf::from("/Users/x/Music/Shiranami Downloads"),
            "users already have this folder, already watch it, and already \
             have tracks in it"
        );
    }

    #[test]
    fn a_blank_configured_path_reads_as_unconfigured() {
        assert_eq!(normalize_configured(None), None);
        assert_eq!(normalize_configured(Some("")), None);
        assert_eq!(
            normalize_configured(Some("   ")),
            None,
            "a path pasted with only whitespace must clear the setting, not \
             be stored and then fail to resolve"
        );
    }

    /// The platform's absolute form of a rooted test path.
    ///
    /// Not `PathBuf::from(path)`: on Windows `/custom/downloads` has a root but
    /// no drive prefix, so it is *not absolute*, and [`absolute`] resolves it
    /// against the current drive — which is the whole job of that function. The
    /// behaviour is right; only spelling the expectation POSIX-style was wrong.
    fn rooted(path: &str) -> PathBuf {
        let resolved = absolute(Path::new(path));
        assert!(
            resolved.is_absolute(),
            "the fixture must be absolute, or the assertions using it prove nothing"
        );
        resolved
    }

    #[test]
    fn a_configured_path_is_trimmed_and_made_absolute() {
        // The surrounding whitespace is the part under test; `rooted` carries
        // the platform's spelling so the trim is what the comparison turns on.
        assert_eq!(
            normalize_configured(Some("  /custom/downloads  ")),
            Some(rooted("/custom/downloads"))
        );
    }

    #[test]
    fn the_active_directory_falls_back_to_the_default() {
        assert_eq!(active_dir(&music(), None), default_dir(&music()));
        assert_eq!(
            active_dir(&music(), Some("/custom/downloads")),
            rooted("/custom/downloads")
        );
    }

    #[test]
    fn a_path_equal_to_the_default_is_recognised_as_the_default() {
        assert!(is_default(
            &music(),
            Path::new("/Users/x/Music/Shiranami Downloads")
        ));
        assert!(
            is_default(&music(), Path::new("/Users/x/Music/Shiranami Downloads/")),
            "a trailing separator does not make it a different directory"
        );
        assert!(!is_default(&music(), Path::new("/custom/downloads")));
    }

    #[tokio::test]
    async fn the_state_creates_the_directory_and_reports_the_default() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let music_dir = temp.path().join("Music");

        let state = state(&music_dir, None).await.expect("the state resolves");

        assert!(state.is_default);
        assert_eq!(state.path, state.default_path);
        assert!(
            PathBuf::from(&state.path).is_dir(),
            "the directory is created so a download has somewhere to land"
        );
    }

    #[tokio::test]
    async fn a_custom_location_reports_itself_as_not_default() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let music_dir = temp.path().join("Music");
        let custom = temp.path().join("Elsewhere");

        let state = state(&music_dir, Some(&custom.to_string_lossy()))
            .await
            .expect("the state resolves");

        assert!(!state.is_default);
        assert_eq!(state.path, custom.to_string_lossy());
        assert_eq!(
            state.default_path,
            default_dir(&music_dir).to_string_lossy()
        );
        assert!(custom.is_dir());
    }
}
