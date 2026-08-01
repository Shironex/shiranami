//! `downloader:get-download-location` and `downloader:set-download-location`.
//!
//! Two channels over one stored string, and almost all of the behaviour is in
//! what counts as "no configuration".
//!
//! # Three inputs mean "reset", and the third is the one that matters
//!
//! `setDownloadLocation` takes `string | null`, and v1 deleted the store key
//! for **`null`, an empty string, and any string that is only whitespace** —
//! `typeof downloadDir !== 'string' || downloadDir.trim().length === 0`. The
//! renderer sends an empty string when the user clears the field, so the second
//! case is the common one and the schema comment says so outright.
//!
//! There is a fourth: a path that normalizes to the default directory also
//! deletes the key rather than storing it. That keeps `isDefault` true after a
//! user picks the default folder through the OS file dialog, which is otherwise
//! a setting that looks changed and is not.
//!
//! # Setting the location always creates the directory
//!
//! Both channels answer with [`DownloadLocation`], and building one calls
//! `location::state`, which creates the resolved directory. That is v1's
//! `ensureDownloadDir` inside `getDownloadLocationState`, and it is why the
//! settings panel can show a path that is guaranteed to exist rather than one
//! that might.
//!
//! # The folders cache invalidation is deferred
//!
//! v1 called `invalidateFoldersCache()` on every set, because the downloads
//! directory is one of the roots the library watches. `shiranami-core`'s
//! `paths::folders_cache` is the port of that cache, but the *invalidation* is
//! wired where the watcher is, which is the library lane's. Recorded here
//! rather than silently dropped: until it lands, a changed download location
//! needs a rescan to be watched.

use shiranami_core::models::DownloadLocation;
use shiranami_core::store::MainStoreKey;
use shiranami_downloader::location;
use tauri::{AppHandle, Manager as _, State};

use crate::error::{CommandResult, WireResultExt as _, bad_request};
use crate::state::AppState;

/// `downloader:get-download-location` — where downloads land, and whether that
/// is still the default.
#[tauri::command]
#[specta::specta]
pub async fn downloader_get_download_location(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<DownloadLocation> {
    let music_dir = music_dir(&app)?;
    let configured = state.settings().downloads_location();

    location::state(
        &music_dir,
        configured.as_deref().and_then(std::path::Path::to_str),
    )
    .await
    .wire()
}

/// `downloader:set-download-location` — store a directory, or reset to default.
///
/// `None`, `""` and `"   "` all reset. See the module docs.
#[tauri::command]
#[specta::specta]
pub async fn downloader_set_download_location(
    app: AppHandle,
    state: State<'_, AppState>,
    download_dir: Option<String>,
) -> CommandResult<DownloadLocation> {
    let music_dir = music_dir(&app)?;

    // `normalize_configured` is the crate's port of v1's trim-and-resolve, and
    // it is what decides between "store this" and "reset": it answers `None`
    // for null, empty and whitespace alike.
    let resolved = location::normalize_configured(download_dir.as_deref());

    let stored = match resolved {
        // The fourth reset case: a path that *is* the default is not a setting.
        Some(path) if location::is_default(&music_dir, &path) => None,
        Some(path) => {
            // v1 created the directory before storing it, so a set that the
            // filesystem refuses does not leave a path in the store that the
            // next read cannot resolve.
            location::ensure(&path).await.wire()?;
            Some(path)
        }
        None => None,
    };

    match stored {
        Some(path) => state
            .settings()
            .set_main(
                MainStoreKey::DownloadsLocation,
                serde_json::Value::String(path.to_string_lossy().into_owned()),
            )
            .wire()?,
        None => state
            .settings()
            .delete_main(MainStoreKey::DownloadsLocation)
            .wire()?,
    }

    let configured = state.settings().downloads_location();
    location::state(
        &music_dir,
        configured.as_deref().and_then(std::path::Path::to_str),
    )
    .await
    .wire()
}

/// The user's music directory — v1's `app.getPath('music')`.
///
/// # Errors
///
/// `BAD_REQUEST` when the platform cannot name one. Tauri resolves this from
/// the OS rather than guessing, and a machine with no music directory is a
/// machine where the default download folder has nowhere to go; answering with
/// a fabricated path would put downloads somewhere the user never agreed to.
pub(super) fn music_dir(app: &AppHandle) -> CommandResult<std::path::PathBuf> {
    app.path()
        .audio_dir()
        .map_err(|error| bad_request(format!("no music directory on this platform: {error}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::store::SettingsStore;
    use shiranami_downloader::location::DOWNLOADS_FOLDER;
    use std::path::Path;

    /// The reset/store decision, extracted exactly as the command performs it.
    ///
    /// The command itself takes an `AppHandle`, which no unit test has; this is
    /// the branch that carries every one of v1's four reset cases, so it is
    /// what the tests drive. The command body above is four lines of glue over
    /// it.
    fn decide(music_dir: &Path, input: Option<&str>) -> Option<std::path::PathBuf> {
        match location::normalize_configured(input) {
            Some(path) if location::is_default(music_dir, &path) => None,
            other => other,
        }
    }

    fn music(dir: &Path) -> std::path::PathBuf {
        dir.join("Music")
    }

    /// v1: `typeof downloadDir !== 'string' || downloadDir.trim().length === 0`.
    /// The empty string is the case the renderer actually sends, when the user
    /// clears the field.
    #[test]
    fn null_empty_and_whitespace_all_reset_to_the_default() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let music = music(dir.path());

        for input in [None, Some(""), Some("   "), Some("\t\n")] {
            assert_eq!(
                decide(&music, input),
                None,
                "`{input:?}` must clear the stored location"
            );
        }
    }

    #[test]
    fn a_real_path_is_stored_absolute() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let music = music(dir.path());
        let elsewhere = dir.path().join("elsewhere");

        let stored = decide(&music, elsewhere.to_str()).expect("a real path is stored");

        assert_eq!(stored, elsewhere);
        assert!(stored.is_absolute());
    }

    /// A path pasted with a trailing space is a real thing users do, and
    /// storing it would produce a setting that then fails to resolve.
    #[test]
    fn surrounding_whitespace_is_trimmed_before_storing() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let music = music(dir.path());
        let elsewhere = dir.path().join("elsewhere");
        let padded = format!("  {}  ", elsewhere.display());

        assert_eq!(decide(&music, Some(&padded)), Some(elsewhere));
    }

    /// The fourth reset case: picking the default folder through the OS dialog
    /// must leave `isDefault` true rather than storing a setting that merely
    /// happens to equal the default.
    #[test]
    fn a_path_that_is_the_default_clears_the_key_instead_of_storing_it() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let music = music(dir.path());
        let default = music.join(DOWNLOADS_FOLDER);

        assert_eq!(decide(&music, default.to_str()), None);
    }

    /// The shape both channels answer with, over a real settings file.
    #[tokio::test]
    async fn the_answer_carries_v1s_three_fields_and_creates_the_directory() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let music = music(dir.path());

        let answer = location::state(&music, None)
            .await
            .expect("the default resolves");

        assert_eq!(answer.path, music.join(DOWNLOADS_FOLDER).to_string_lossy());
        assert_eq!(answer.default_path, answer.path);
        assert!(answer.is_default);
        assert!(
            Path::new(&answer.path).is_dir(),
            "v1's getDownloadLocationState ensured the directory existed"
        );
    }

    #[tokio::test]
    async fn a_configured_location_answers_is_default_false() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let music = music(dir.path());
        let elsewhere = dir.path().join("elsewhere");

        let answer = location::state(&music, elsewhere.to_str())
            .await
            .expect("a configured location resolves");

        assert_eq!(answer.path, elsewhere.to_string_lossy());
        assert_eq!(
            answer.default_path,
            music.join(DOWNLOADS_FOLDER).to_string_lossy(),
            "the default is still reported, so the panel can offer a reset"
        );
        assert!(!answer.is_default);
    }

    /// The key these commands write is main-only, so `store:set` cannot reach
    /// it. Worth pinning here as well as in the store namespace: the download
    /// location is the one main-only key with a visible settings control, which
    /// is exactly the shape of thing someone later wires to the generic store
    /// channel by mistake.
    #[test]
    fn the_location_is_stored_under_a_main_only_key() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let (settings, _quarantined) = SettingsStore::load(dir.path().join("config.json"));

        settings
            .set_main(
                MainStoreKey::DownloadsLocation,
                serde_json::Value::String("/tmp/x".to_owned()),
            )
            .expect("write the location");

        assert_eq!(
            settings.downloads_location(),
            Some(std::path::PathBuf::from("/tmp/x"))
        );
        assert!(
            serde_json::from_value::<shiranami_core::store::RendererStoreKey>(
                serde_json::Value::String("downloads.location".to_owned())
            )
            .is_err()
        );
    }
}
