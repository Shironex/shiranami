//! The two queue seams that reach for the settings file.
//!
//! `DownloadQueue::new` takes four `Arc<dyn Trait>`s. Two of them —
//! `QueuePersistence` and `SnapshotSink` — have implementations already
//! (`SqlitePersistence` in the crate, [`super::QueueEvents`] here). The other
//! two do not, and both for the same reason: they answer questions only the
//! settings store can answer.
//!
//! # The paused flag is persisted, and that is v1 behaviour
//!
//! `downloader:queue-pause` survives a restart. v1 stored it outside the
//! `download_queue` table because the flag is not a property of any item — an
//! empty paused queue is a real state, and a paused queue whose last item was
//! cleared must stay paused. `MainStoreKey::DownloadsQueuePaused` is where it
//! lives, and it is **main-only**: the renderer reads `paused` off the queue
//! snapshot, never off the store, so it has no reason to name the key and
//! `RendererStoreKey` correctly refuses it.
//!
//! # The directory is resolved per download, not cached
//!
//! `DownloadDirectory::resolve` is called for each download rather than once,
//! which matters because `downloader:set-download-location` can change the
//! answer between two items of the same batch. v1 had the same property, by
//! calling `getDownloadDir()` inside the queue's runner rather than closing
//! over a value. Resolving also **creates** the directory, so a user who
//! deleted it between enqueue and start gets it back rather than an error.

use std::path::PathBuf;
use std::sync::Arc;

use serde_json::Value;
use shiranami_core::store::{MainStoreKey, SettingsStore};
use shiranami_downloader::queue::{DownloadDirectory, PausedFlag};
use shiranami_downloader::{DownloaderError, location};

/// The queue's paused flag, over `downloads.queuePaused`.
pub struct SettingsPausedFlag {
    settings: Arc<SettingsStore>,
}

impl SettingsPausedFlag {
    /// Read and write the flag through `settings`.
    pub fn new(settings: Arc<SettingsStore>) -> Self {
        Self { settings }
    }
}

#[async_trait::async_trait]
impl PausedFlag for SettingsPausedFlag {
    async fn is_paused(&self) -> bool {
        self.settings
            .get_main(MainStoreKey::DownloadsQueuePaused)
            .and_then(|value| value.as_bool())
            .unwrap_or(false)
    }

    async fn set_paused(&self, paused: bool) {
        // The trait is infallible on purpose: a queue that refused to pause
        // because a disk write failed would leave the UI showing "paused" over
        // a queue that kept downloading, which is worse than a flag that does
        // not survive the restart.
        if let Err(error) = self
            .settings
            .set_main(MainStoreKey::DownloadsQueuePaused, Value::Bool(paused))
        {
            tracing::warn!(%error, "could not persist the download queue's paused flag");
        }
    }
}

/// Where finished downloads land, resolved from the settings file.
///
/// Holds the music directory rather than looking it up, because
/// `AppHandle::path` is a shell capability and this type is handed to a crate.
pub struct SettingsDownloadDirectory {
    settings: Arc<SettingsStore>,
    music_dir: PathBuf,
}

impl SettingsDownloadDirectory {
    /// Resolve against `settings`, defaulting inside `music_dir`.
    pub fn new(settings: Arc<SettingsStore>, music_dir: PathBuf) -> Self {
        Self {
            settings,
            music_dir,
        }
    }
}

impl DownloadDirectory for SettingsDownloadDirectory {
    fn resolve(&self) -> Result<PathBuf, DownloaderError> {
        let configured = self.settings.downloads_location();
        let directory = location::active_dir(
            &self.music_dir,
            configured.as_deref().and_then(std::path::Path::to_str),
        );

        // `location::ensure` is async and this trait method is not, so the
        // creation is the blocking form. It runs on the queue driver's task,
        // never on the webview thread, and a `create_dir_all` on an existing
        // directory is one `stat`.
        std::fs::create_dir_all(&directory).map_err(|source| DownloaderError::Io {
            operation: "create the downloads directory",
            path: directory.clone(),
            source,
        })?;

        Ok(directory)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_downloader::location::DOWNLOADS_FOLDER;

    fn store(dir: &std::path::Path) -> Arc<SettingsStore> {
        let (settings, _quarantined) = SettingsStore::load(dir.join("config.json"));
        Arc::new(settings)
    }

    #[tokio::test]
    async fn the_paused_flag_starts_false_and_round_trips() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let flag = SettingsPausedFlag::new(store(dir.path()));

        assert!(!flag.is_paused().await, "a fresh install is not paused");

        flag.set_paused(true).await;
        assert!(flag.is_paused().await);

        flag.set_paused(false).await;
        assert!(!flag.is_paused().await);
    }

    /// The flag lives outside the queue table precisely so it survives an empty
    /// queue, and outside the *renderer* key space so the store commands cannot
    /// reach it.
    #[test]
    fn the_paused_key_is_main_only() {
        let parsed: Result<shiranami_core::store::RendererStoreKey, _> =
            serde_json::from_value(Value::String("downloads.queuePaused".to_owned()));

        assert!(parsed.is_err());
    }

    #[test]
    fn an_unconfigured_directory_resolves_under_the_music_folder() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let music = dir.path().join("Music");
        let directory = SettingsDownloadDirectory::new(store(dir.path()), music.clone());

        let resolved = directory.resolve().expect("resolve the default");

        assert_eq!(resolved, music.join(DOWNLOADS_FOLDER));
        assert!(resolved.is_dir(), "resolving creates the directory");
    }

    /// The reason `resolve` is called per download rather than once: a change
    /// through `downloader:set-download-location` must be visible to the next
    /// item of a batch already in flight.
    #[test]
    fn a_configured_directory_wins_and_is_re_read_each_time() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let settings = store(dir.path());
        let elsewhere = dir.path().join("elsewhere");
        let directory =
            SettingsDownloadDirectory::new(Arc::clone(&settings), dir.path().join("Music"));

        settings
            .set_main(
                MainStoreKey::DownloadsLocation,
                Value::String(elsewhere.to_string_lossy().into_owned()),
            )
            .expect("configure a location");

        assert_eq!(directory.resolve().expect("resolve"), elsewhere);

        settings
            .delete_main(MainStoreKey::DownloadsLocation)
            .expect("clear the location");

        assert_eq!(
            directory.resolve().expect("resolve again"),
            dir.path().join("Music").join(DOWNLOADS_FOLDER),
            "the same instance must see the cleared setting"
        );
    }

    /// v1 treated a blank string exactly as an absent key, and the renderer
    /// still sends one when the user clears the field.
    #[test]
    fn a_blank_configured_directory_falls_back_to_the_default() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let settings = store(dir.path());
        let music = dir.path().join("Music");
        let directory = SettingsDownloadDirectory::new(Arc::clone(&settings), music.clone());

        settings
            .set_main(MainStoreKey::DownloadsLocation, Value::String("   ".into()))
            .expect("configure a blank location");

        assert_eq!(
            directory.resolve().expect("resolve"),
            music.join(DOWNLOADS_FOLDER)
        );
    }
}
