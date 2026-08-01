//! Controllable doubles for driving [`DownloadQueue`] through every transition.
//!
//! v1's queue test used a runner that captured `resolve`/`reject` out of a
//! promise, so a test could decide *when* and *how* each download finished.
//! The async equivalent is a oneshot per download: the runner parks on the
//! receiver, the test holds the sender.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use shiranami_core::models::{DownloadQueueItem, DownloadQueueSnapshot};
use shiranami_downloader::download::{
    DownloadFailure, DownloadProgressSink, DownloadRequest, DownloadRunner,
};
use shiranami_downloader::queue::{DownloadDirectory, QueuePersistence, SnapshotSink};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

/// One download the runner has been asked for and has not answered yet.
pub(crate) struct Run {
    /// The URL it was asked to download.
    pub(crate) url: String,
    /// The token the queue threaded in, so a test can read `is_cancelled`.
    pub(crate) cancel: CancellationToken,
    finish: Option<oneshot::Sender<Result<PathBuf, DownloadFailure>>>,
}

impl Run {
    /// Finish this download successfully.
    pub(crate) fn resolve(&mut self, path: &str) {
        if let Some(finish) = self.finish.take() {
            let _ = finish.send(Ok(PathBuf::from(path)));
        }
    }

    /// Finish this download with a failure.
    pub(crate) fn reject(&mut self, message: &str) {
        if let Some(finish) = self.finish.take() {
            let _ = finish.send(Err(DownloadFailure::Failed(
                shiranami_downloader::DownloaderError::YtDlp {
                    code: message.to_owned(),
                },
            )));
        }
    }

    /// Finish this download as the user's own cancellation.
    pub(crate) fn cancelled(&mut self) {
        if let Some(finish) = self.finish.take() {
            let _ = finish.send(Err(DownloadFailure::Cancelled));
        }
    }
}

/// A runner that answers only when a test tells it to.
#[derive(Default)]
pub(crate) struct ControllableRunner {
    runs: Mutex<Vec<Run>>,
}

impl ControllableRunner {
    /// How many downloads have been started.
    pub(crate) fn started(&self) -> usize {
        self.runs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .len()
    }

    /// Every started download's URL, in start order.
    pub(crate) fn urls(&self) -> Vec<String> {
        self.runs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter()
            .map(|run| run.url.clone())
            .collect()
    }

    /// Whether every started download's token has been cancelled.
    pub(crate) fn all_cancelled(&self) -> bool {
        self.runs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter()
            .all(|run| run.cancel.is_cancelled())
    }

    /// Whether the download at `index` has had its token cancelled.
    pub(crate) fn is_cancelled(&self, index: usize) -> bool {
        self.runs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(index)
            .is_some_and(|run| run.cancel.is_cancelled())
    }

    /// Act on the download at `index`.
    pub(crate) fn with<R>(&self, index: usize, act: impl FnOnce(&mut Run) -> R) -> Option<R> {
        self.runs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get_mut(index)
            .map(act)
    }

    /// Act on the download for `url`.
    pub(crate) fn with_url<R>(&self, url: &str, act: impl FnOnce(&mut Run) -> R) -> Option<R> {
        self.runs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter_mut()
            .find(|run| run.url == url)
            .map(act)
    }

    /// Wait until at least `count` downloads have started.
    pub(crate) async fn wait_for(&self, count: usize) {
        until(|| self.started() >= count).await;
    }
}

#[async_trait::async_trait]
impl DownloadRunner for ControllableRunner {
    async fn download(
        &self,
        request: &DownloadRequest,
        _progress: &dyn DownloadProgressSink,
        cancel: &CancellationToken,
    ) -> Result<PathBuf, DownloadFailure> {
        let (finish, wait) = oneshot::channel();

        self.runs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(Run {
                url: request.url.clone(),
                cancel: cancel.clone(),
                finish: Some(finish),
            });

        wait.await.unwrap_or(Err(DownloadFailure::Cancelled))
    }
}

/// A sink that keeps every snapshot it was handed.
#[derive(Default)]
pub(crate) struct RecordingSink {
    snapshots: Mutex<Vec<DownloadQueueSnapshot>>,
}

impl RecordingSink {
    /// How many snapshots have been emitted.
    pub(crate) fn count(&self) -> usize {
        self.snapshots
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .len()
    }

    /// The most recent snapshot.
    pub(crate) fn last(&self) -> Option<DownloadQueueSnapshot> {
        self.snapshots
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .last()
            .cloned()
    }
}

impl SnapshotSink for RecordingSink {
    fn emit(&self, snapshot: DownloadQueueSnapshot) {
        self.snapshots
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(snapshot);
    }
}

/// Everything the persistence layer was asked to do.
#[derive(Debug, Default, Clone, PartialEq)]
pub(crate) struct PersistenceCalls {
    /// Items handed to `upsert`, snapshotted at call time.
    pub(crate) upserted: Vec<DownloadQueueItem>,
    /// Ids handed to `remove` and `remove_many`, in order.
    pub(crate) removed: Vec<String>,
    /// How many times `clear` was called.
    pub(crate) cleared: usize,
    /// Every value handed to `set_paused`, in order.
    pub(crate) paused_set: Vec<bool>,
}

/// An in-memory persistence that records every call.
pub(crate) struct FakePersistence {
    seed: Vec<DownloadQueueItem>,
    paused: Mutex<bool>,
    calls: Mutex<PersistenceCalls>,
}

impl FakePersistence {
    /// Persistence that loads `seed` and starts `paused`.
    pub(crate) fn new(seed: Vec<DownloadQueueItem>, paused: bool) -> Self {
        Self {
            seed,
            paused: Mutex::new(paused),
            calls: Mutex::new(PersistenceCalls::default()),
        }
    }

    /// Empty, running persistence.
    pub(crate) fn empty() -> Self {
        Self::new(Vec::new(), false)
    }

    /// What it has been asked to do so far.
    pub(crate) fn calls(&self) -> PersistenceCalls {
        self.calls
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

#[async_trait::async_trait]
impl QueuePersistence for FakePersistence {
    async fn load(&self) -> shiranami_downloader::Result<Vec<DownloadQueueItem>> {
        Ok(self.seed.clone())
    }

    async fn upsert(&self, item: &DownloadQueueItem) -> shiranami_downloader::Result<()> {
        // Snapshotted at call time, as v1's fake did: a later in-place mutation
        // must not retroactively change what was recorded.
        self.calls
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .upserted
            .push(item.clone());
        Ok(())
    }

    async fn remove(&self, id: &str) -> shiranami_downloader::Result<()> {
        self.calls
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .removed
            .push(id.to_owned());
        Ok(())
    }

    async fn remove_many(&self, ids: &[String]) -> shiranami_downloader::Result<()> {
        self.calls
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .removed
            .extend_from_slice(ids);
        Ok(())
    }

    async fn clear(&self) -> shiranami_downloader::Result<()> {
        self.calls
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .cleared += 1;
        Ok(())
    }

    async fn is_paused(&self) -> bool {
        *self
            .paused
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    async fn set_paused(&self, paused: bool) {
        *self
            .paused
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = paused;
        self.calls
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .paused_set
            .push(paused);
    }
}

/// A download directory that always resolves to the same place.
pub(crate) struct FixedDirectory(pub(crate) PathBuf);

impl DownloadDirectory for FixedDirectory {
    fn resolve(&self) -> shiranami_downloader::Result<PathBuf> {
        Ok(self.0.clone())
    }
}

/// A download directory that always fails, for v1's synchronous-throw path.
pub(crate) struct FailingDirectory;

impl DownloadDirectory for FailingDirectory {
    fn resolve(&self) -> shiranami_downloader::Result<PathBuf> {
        Err(shiranami_downloader::DownloaderError::Io {
            operation: "create the downloads directory",
            path: PathBuf::from("/nope"),
            source: std::io::Error::other("read-only file system"),
        })
    }
}

/// Poll `condition` until it holds, or fail the test.
///
/// The queue starts downloads on spawned tasks, so a method returning does not
/// mean the download has begun. Polling with a ceiling is what keeps a broken
/// transition failing in a second rather than hanging CI.
pub(crate) async fn until(mut condition: impl FnMut() -> bool) {
    for _ in 0..2_000 {
        if condition() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(1)).await;
    }
    panic!("condition never held within two seconds");
}

/// Build a persisted item, for hydrate tests.
pub(crate) fn seed_item(
    id: &str,
    url: &str,
    status: shiranami_core::models::DownloadQueueStatus,
    enqueued_at: i64,
) -> DownloadQueueItem {
    DownloadQueueItem {
        id: id.to_owned(),
        url: url.to_owned(),
        youtube_id: None,
        title: id.to_owned(),
        thumbnail: None,
        status,
        progress: if status == shiranami_core::models::DownloadQueueStatus::Done {
            100.0
        } else {
            0.0
        },
        file_path: None,
        error: None,
        batch_id: None,
        batch_index: None,
        batch_source_title: None,
        batch_create_playlist: None,
        enqueued_at,
        started_at: None,
        finished_at: None,
    }
}

/// Assemble a queue over the given doubles.
pub(crate) fn queue(
    persistence: Arc<FakePersistence>,
    runner: Arc<ControllableRunner>,
    sink: Arc<RecordingSink>,
) -> Arc<shiranami_downloader::queue::DownloadQueue> {
    shiranami_downloader::queue::DownloadQueue::new(
        persistence,
        runner,
        sink,
        Arc::new(FixedDirectory(PathBuf::from("/tmp/downloads"))),
    )
}
