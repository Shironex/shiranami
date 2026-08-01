//! The queue's driver: applies effects, owns the child processes.
//!
//! # The lock is never held across an await
//!
//! [`QueueState`] sits behind a `std::sync::Mutex`, not a `tokio` one. Every
//! transition is synchronous, so the lock is taken, the effects are collected,
//! and the lock is dropped *before* anything is awaited. That is what
//! `clippy::await_holding_lock` enforces workspace-wide (§2.3), and it is why
//! the state machine was made pure in the first place.
//!
//! # Persistence failures never take down a download
//!
//! v1's persistence swallowed every error, and this keeps the policy: a write
//! that fails is logged, and the in-memory queue carries on. The download the
//! user is watching keeps working; the cost of the failure is that it may not
//! survive the next restart. `shiranami-db`'s repository module records that
//! this is where the swallowing belongs.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use shiranami_core::models::{
    DownloadProgress, DownloadProgressStatus, DownloadQueueSnapshot, EnqueueDownloadInput,
};
use tokio_util::sync::CancellationToken;

use crate::download::{DownloadFailure, DownloadProgressSink, DownloadRequest, DownloadRunner};
use crate::queue::broadcast::{SnapshotSink, Throttle};
use crate::queue::persistence::QueuePersistence;
use crate::queue::state::{Effect, QueueState};
use shiranami_core::sync::lock_or_recover as lock;

/// Resolves the directory downloads are written to.
///
/// A trait because the answer depends on a setting and on creating the
/// directory, both of which belong to the composition root — and because v1's
/// resolution could *throw*, which is a case the queue has to survive.
pub trait DownloadDirectory: Send + Sync {
    /// The directory to write into, created if missing.
    ///
    /// # Errors
    ///
    /// Any failure to resolve or create it. v1 let this throw synchronously
    /// out of `start()`, which left the item wedged in `active` forever with
    /// its concurrency slot held; here it settles the item as `error`.
    fn resolve(&self) -> crate::Result<PathBuf>;
}

/// The download queue.
pub struct DownloadQueue {
    state: Mutex<QueueState>,
    /// One token per running download, so `cancel` can reach its child.
    tokens: Mutex<HashMap<String, CancellationToken>>,
    persistence: Arc<dyn QueuePersistence>,
    runner: Arc<dyn DownloadRunner>,
    sink: Arc<dyn SnapshotSink>,
    directory: Arc<dyn DownloadDirectory>,
    throttle: Throttle,
}

impl DownloadQueue {
    /// Build a queue. Construction starts nothing — see
    /// [`Self::hydrate_and_resume`].
    ///
    /// v1 separated the two for a reason worth keeping: a constructor that
    /// spawns downloads cannot be called before the database is open, which
    /// makes the boot order load-bearing and undocumented (R18).
    pub fn new(
        persistence: Arc<dyn QueuePersistence>,
        runner: Arc<dyn DownloadRunner>,
        sink: Arc<dyn SnapshotSink>,
        directory: Arc<dyn DownloadDirectory>,
    ) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(QueueState::new()),
            tokens: Mutex::new(HashMap::new()),
            persistence,
            runner,
            sink,
            directory,
            throttle: Throttle::new(),
        })
    }

    /// The queue as the renderer mirrors it.
    pub fn snapshot(&self) -> DownloadQueueSnapshot {
        lock(&self.state).snapshot()
    }

    /// Reload the persisted queue and resume downloading.
    ///
    /// Best effort: a failure to read persisted state is logged and the queue
    /// starts empty. v1 wrapped this in a `try` because the call sat inside IPC
    /// registration, where a throw would silently skip every handler registered
    /// after it.
    pub async fn hydrate_and_resume(self: &Arc<Self>) {
        let paused = self.persistence.is_paused().await;
        let items = match self.persistence.load().await {
            Ok(items) => items,
            Err(error) => {
                tracing::warn!(%error, "could not hydrate the persisted download queue");
                Vec::new()
            }
        };

        if !items.is_empty() {
            tracing::info!(
                count = items.len(),
                paused,
                "restored download queue items from disk"
            );
        }

        let effects = lock(&self.state).hydrate(items, paused);
        self.apply(effects).await;
    }

    /// Add one download and start it if a slot is free.
    ///
    /// Returns the new item's id. The id is a v4 UUID minted here rather than
    /// by SQLite, as every v1 handler did — the renderer's `z.string().uuid()`
    /// guards depend on it.
    pub async fn enqueue(self: &Arc<Self>, input: EnqueueDownloadInput) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let effects = lock(&self.state).enqueue(input, id.clone(), now_ms());
        self.apply(effects).await;
        id
    }

    /// Cancel one item.
    pub async fn cancel(self: &Arc<Self>, id: &str) {
        let effects = lock(&self.state).cancel(id, now_ms());
        self.apply(effects).await;
    }

    /// Cancel everything and empty the queue.
    pub async fn cancel_all(self: &Arc<Self>) {
        let effects = lock(&self.state).cancel_all();
        self.apply(effects).await;
    }

    /// Remove finished, failed and cancelled items — except batch ones.
    pub async fn clear_completed(self: &Arc<Self>) {
        let effects = lock(&self.state).clear_completed();
        self.apply(effects).await;
    }

    /// Stop promoting queued items.
    pub async fn pause(self: &Arc<Self>) {
        let effects = lock(&self.state).pause();
        self.apply(effects).await;
    }

    /// Resume promoting queued items.
    pub async fn resume(self: &Arc<Self>) {
        let effects = lock(&self.state).resume();
        self.apply(effects).await;
    }

    /// Drop the rows for items the renderer has imported.
    pub async fn mark_imported(self: &Arc<Self>, ids: &[String]) {
        let effects = lock(&self.state).mark_imported(ids);
        self.apply(effects).await;
    }

    /// Perform a transition's effects, in order.
    async fn apply(self: &Arc<Self>, effects: Vec<Effect>) {
        for effect in effects {
            match effect {
                Effect::Persist(item) => {
                    if let Err(error) = self.persistence.upsert(&item).await {
                        tracing::warn!(%error, "could not persist a download queue item");
                    }
                }
                Effect::Forget(id) => {
                    if let Err(error) = self.persistence.remove(&id).await {
                        tracing::warn!(%error, "could not remove a persisted download queue item");
                    }
                }
                Effect::ForgetMany(ids) => {
                    if let Err(error) = self.persistence.remove_many(&ids).await {
                        tracing::warn!(%error, "could not remove persisted download queue items");
                    }
                }
                Effect::Clear => {
                    if let Err(error) = self.persistence.clear().await {
                        tracing::warn!(%error, "could not clear the persisted download queue");
                    }
                }
                Effect::SetPaused(paused) => self.persistence.set_paused(paused).await,
                Effect::Start(id) => self.spawn_download(id),
                Effect::Abort(id) => {
                    if let Some(token) = lock(&self.tokens).get(&id) {
                        token.cancel();
                    }
                }
                Effect::Broadcast => self.flush(),
                Effect::BroadcastProgress => self.schedule_flush(),
            }
        }
    }

    /// Emit a snapshot now, cancelling any pending progress tick.
    fn flush(&self) {
        self.throttle.cancel();
        self.sink.emit(self.snapshot());
    }

    /// Emit a snapshot on the next throttle tick.
    fn schedule_flush(self: &Arc<Self>) {
        let queue = Arc::clone(self);
        self.throttle.schedule(move || {
            queue.sink.emit(queue.snapshot());
        });
    }

    /// Begin one item's download on its own task.
    ///
    /// `tokio::spawn` rather than `tauri::async_runtime::spawn` (§2.3) because
    /// this crate has no Tauri dependency and every path that reaches here is
    /// already `async` — that is, already inside the runtime, which is the
    /// condition the rule exists to guarantee. The composition root calls these
    /// methods from `async` commands.
    fn spawn_download(self: &Arc<Self>, id: String) {
        let queue = Arc::clone(self);
        tokio::spawn(async move {
            queue.run_download(id).await;
        });
    }

    /// Run one download to its terminal state.
    async fn run_download(self: &Arc<Self>, id: String) {
        let Some(url) = lock(&self.state).get(&id).map(|item| item.url.clone()) else {
            return;
        };

        let download_dir = match self.directory.resolve() {
            Ok(dir) => dir,
            Err(error) => {
                // v1's synchronous-throw path. Without this branch the item
                // stays `active` with a live token, holding a concurrency slot
                // that nothing will ever free.
                tracing::error!(id, url, %error, "download item failed before starting");
                let effects = lock(&self.state).finish_error(&id, error.to_string(), now_ms());
                self.apply(effects).await;
                return;
            }
        };

        lock(&self.state).stamp_started(&id, now_ms());

        let token = CancellationToken::new();
        lock(&self.tokens).insert(id.clone(), token.clone());

        let request = DownloadRequest {
            url: url.clone(),
            download_dir,
        };
        let observer = QueueObserver {
            queue: Arc::clone(self),
            id: id.clone(),
        };

        let outcome = self.runner.download(&request, &observer, &token).await;

        lock(&self.tokens).remove(&id);

        let effects = {
            let mut state = lock(&self.state);
            match outcome {
                Ok(path) => state.finish_done(&id, path.to_string_lossy().into_owned(), now_ms()),
                Err(DownloadFailure::Cancelled) => state.finish_cancelled(&id, now_ms()),
                Err(DownloadFailure::Failed(error)) => {
                    tracing::error!(id, url, %error, "download item failed");
                    state.finish_error(&id, error.to_string(), now_ms())
                }
            }
        };

        self.apply(effects).await;
    }
}

/// Routes one download's progress into the queue's state.
///
/// Progress transitions produce only broadcast effects — never a persistence
/// write — so they are applied inline rather than through the async
/// [`DownloadQueue::apply`], which is what lets this stay a synchronous sink.
struct QueueObserver {
    queue: Arc<DownloadQueue>,
    id: String,
}

impl DownloadProgressSink for QueueObserver {
    fn progress(&self, event: DownloadProgress) {
        let effects = match event.status {
            DownloadProgressStatus::Downloading => {
                lock(&self.queue.state).on_progress(&self.id, event.progress)
            }
            DownloadProgressStatus::Converting => lock(&self.queue.state).on_converting(&self.id),
            // `done` and `error` are settled by the runner's return value, not
            // by a progress event. v1 said the same in a comment; here the
            // types say it.
            DownloadProgressStatus::Done | DownloadProgressStatus::Error => Vec::new(),
        };

        for effect in effects {
            match effect {
                Effect::Broadcast => self.queue.flush(),
                Effect::BroadcastProgress => self.queue.schedule_flush(),
                // A progress transition produces nothing else, and a future one
                // that did would be a persistence write on a path that runs
                // several times a second.
                other => tracing::warn!(?other, "unexpected effect from a progress transition"),
            }
        }
    }
}

/// Now, in epoch milliseconds — the unit every timestamp on the wire uses.
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| {
            i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
        })
}
