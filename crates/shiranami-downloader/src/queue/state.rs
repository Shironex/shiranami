//! The download queue as a pure state machine.
//!
//! Nothing here awaits, spawns, writes to a database or reads a clock. Every
//! transition takes the state from one valid configuration to another and
//! returns a list of [`Effect`]s describing what the outside world should now
//! be told. [`crate::queue::manager`] is the only thing that performs them.
//!
//! # Why the split exists
//!
//! v1's queue interleaved the transitions with their consequences: `enqueue`
//! mutated a `Map`, wrote to SQLite, sent an IPC message and started a child
//! process, in that order, inside one method. Every one of its tests therefore
//! needed a fake persistence, a fake broadcaster and a controllable runner
//! before it could assert that a cancelled queued item becomes `canceled`.
//!
//! Split, that assertion is three lines and no fakes. The transitions are also
//! where the subtle rules live — a batch item survives `clear_completed`, a
//! cancelled *queued* item stays in the list while a cancelled *active* one is
//! only marked when its child actually dies — and those rules are now readable
//! in one file rather than distributed across the I/O that surrounds them.
//!
//! # The states, and v1's transitions between them
//!
//! ```text
//!                 enqueue
//!                    │
//!                    ▼
//!   ┌────────────► queued ──── cancel ────► canceled
//!   │                │
//!   │  (concurrency slot free, not paused)
//!   │                ▼
//!   │             active ───── cancel ────► canceled
//!   │              │   │
//!   │              │   └────── failure ───► error
//!   │   [ExtractAudio]/[Merger]
//!   │              ▼
//!   │          converting ─── cancel ────► canceled
//!   │              │   │
//!   │              │   └────── failure ───► error
//!   │              ▼
//!   │            done
//!   │
//!   └── restart: anything not `done` is reloaded as `queued`
//! ```

use shiranami_core::models::{
    DownloadQueueItem, DownloadQueueSnapshot, DownloadQueueStatus, EnqueueDownloadInput,
};

/// How many downloads run at once. v1's value.
pub const MAX_CONCURRENCY: u32 = 3;

/// Something the outside world has to be told about.
///
/// Ordered as produced: a caller applies them in sequence, and the sequence is
/// v1's own ordering of side effects within each method.
#[derive(Debug, Clone, PartialEq)]
pub enum Effect {
    /// Write this item through to persistence.
    Persist(Box<DownloadQueueItem>),
    /// Drop this item's persisted row. It carries no resume action.
    Forget(String),
    /// Drop several persisted rows.
    ForgetMany(Vec<String>),
    /// Drop every persisted row.
    Clear,
    /// Persist the paused flag.
    SetPaused(bool),
    /// Begin downloading this item.
    Start(String),
    /// Kill this item's running download.
    Abort(String),
    /// Structural change: emit a snapshot now.
    Broadcast,
    /// Progress-only change: emit a snapshot on the next throttle tick.
    BroadcastProgress,
}

/// The queue's contents and its paused flag.
///
/// Items are held in a `Vec` rather than a map because **insertion order is the
/// scheduling order** — v1 relied on JavaScript `Map` iteration order for FIFO
/// promotion, and a `HashMap` would silently lose that. Lookups are linear over
/// a list whose realistic ceiling is one imported playlist.
#[derive(Debug, Default)]
pub struct QueueState {
    items: Vec<DownloadQueueItem>,
    paused: bool,
}

impl QueueState {
    /// An empty, running queue.
    pub fn new() -> Self {
        Self::default()
    }

    /// The queue as the renderer mirrors it.
    pub fn snapshot(&self) -> DownloadQueueSnapshot {
        DownloadQueueSnapshot {
            items: self.items.clone(),
            max_concurrency: MAX_CONCURRENCY,
            active_count: self.active_count(),
            paused: self.paused,
        }
    }

    /// Whether queued items are being promoted.
    pub fn is_paused(&self) -> bool {
        self.paused
    }

    /// One item, by id.
    pub fn get(&self, id: &str) -> Option<&DownloadQueueItem> {
        self.items.iter().find(|item| item.id == id)
    }

    /// How many items hold a concurrency slot.
    ///
    /// `converting` counts: yt-dlp is still running, still using CPU, and its
    /// child is still ours to kill.
    fn active_count(&self) -> u32 {
        u32::try_from(
            self.items
                .iter()
                .filter(|item| {
                    matches!(
                        item.status,
                        DownloadQueueStatus::Active | DownloadQueueStatus::Converting
                    )
                })
                .count(),
        )
        .unwrap_or(u32::MAX)
    }

    fn find_mut(&mut self, id: &str) -> Option<&mut DownloadQueueItem> {
        self.items.iter_mut().find(|item| item.id == id)
    }

    /// Ids of every item currently holding a concurrency slot.
    fn running_ids(&self) -> Vec<String> {
        self.items
            .iter()
            .filter(|item| {
                matches!(
                    item.status,
                    DownloadQueueStatus::Active | DownloadQueueStatus::Converting
                )
            })
            .map(|item| item.id.clone())
            .collect()
    }

    /// Reload persisted items and the persisted paused flag.
    ///
    /// The rows arrive already normalised by the repository — anything that was
    /// not `done` comes back as `queued`, because there is no mid-download
    /// resume protocol and an interrupted transfer starts over.
    pub fn hydrate(&mut self, items: Vec<DownloadQueueItem>, paused: bool) -> Vec<Effect> {
        self.paused = paused;
        self.items = items;

        let mut effects = vec![Effect::Broadcast];
        effects.extend(self.pump());
        effects
    }

    /// Add one item and start it if a slot is free.
    pub fn enqueue(&mut self, input: EnqueueDownloadInput, id: String, now: i64) -> Vec<Effect> {
        let item = DownloadQueueItem {
            id,
            url: input.url,
            youtube_id: input.youtube_id,
            title: input.title,
            thumbnail: input.thumbnail,
            status: DownloadQueueStatus::Queued,
            progress: 0.0,
            file_path: None,
            error: None,
            batch_id: input.batch_id,
            batch_index: input.batch_index,
            batch_source_title: input.batch_source_title,
            batch_create_playlist: input.batch_create_playlist,
            enqueued_at: now,
            started_at: None,
            finished_at: None,
        };

        let mut effects = vec![Effect::Persist(Box::new(item.clone())), Effect::Broadcast];
        self.items.push(item);
        effects.extend(self.pump());
        effects
    }

    /// Stop promoting queued items. In-flight downloads run to completion.
    pub fn pause(&mut self) -> Vec<Effect> {
        if self.paused {
            return Vec::new();
        }
        self.paused = true;
        vec![Effect::SetPaused(true), Effect::Broadcast]
    }

    /// Resume promoting queued items.
    pub fn resume(&mut self) -> Vec<Effect> {
        if !self.paused {
            return Vec::new();
        }
        self.paused = false;

        let mut effects = vec![Effect::SetPaused(false), Effect::Broadcast];
        effects.extend(self.pump());
        effects
    }

    /// Cancel one item.
    ///
    /// A `queued` item is marked immediately — there is no child to kill, so
    /// waiting for one would leave it queued forever. An `active` or
    /// `converting` item is only *asked* to stop; it becomes `canceled` when
    /// [`Self::finish_cancelled`] reports that its child actually died, which
    /// is what keeps the concurrency slot accounted for in the meantime.
    pub fn cancel(&mut self, id: &str, now: i64) -> Vec<Effect> {
        let Some(item) = self.find_mut(id) else {
            return Vec::new();
        };

        match item.status {
            DownloadQueueStatus::Queued => {
                item.status = DownloadQueueStatus::Canceled;
                item.finished_at = Some(now);
                vec![Effect::Forget(id.to_owned()), Effect::Broadcast]
            }
            DownloadQueueStatus::Active | DownloadQueueStatus::Converting => {
                vec![Effect::Abort(id.to_owned())]
            }
            // Terminal. v1's no-op, and the reason a double-click on cancel
            // does not resurrect a finished row.
            DownloadQueueStatus::Done
            | DownloadQueueStatus::Error
            | DownloadQueueStatus::Canceled => Vec::new(),
        }
    }

    /// Cancel everything and empty the queue.
    ///
    /// The paused flag is reset too, so the next enqueue starts normally
    /// instead of landing in a queue the user cannot see is paused.
    pub fn cancel_all(&mut self) -> Vec<Effect> {
        let mut effects: Vec<Effect> = self.running_ids().into_iter().map(Effect::Abort).collect();

        self.items.clear();
        effects.push(Effect::Clear);

        if self.paused {
            self.paused = false;
            effects.push(Effect::SetPaused(false));
        }

        effects.push(Effect::Broadcast);
        effects
    }

    /// Drop the rows for items the renderer has imported into the library.
    ///
    /// Batch items leave the in-memory queue as well as persistence; single
    /// items keep their row in the view until `clear_completed` takes them.
    /// The asymmetry is v1's, and it is what makes a resolved playlist import
    /// disappear from the downloads panel once its playlist has been created.
    pub fn mark_imported(&mut self, ids: &[String]) -> Vec<Effect> {
        let mut effects = vec![Effect::ForgetMany(ids.to_vec())];

        let before = self.items.len();
        self.items
            .retain(|item| !(item.batch_id.is_some() && ids.contains(&item.id)));

        if self.items.len() != before {
            effects.push(Effect::Broadcast);
        }
        effects
    }

    /// Remove finished, failed and cancelled items — except batch ones.
    ///
    /// A batch item stays until its coordinator resolves and calls
    /// [`Self::mark_imported`]. Clearing one early drops its persisted row, so
    /// a restart before the batch finishes reconstructs it with fewer items and
    /// recreates the playlist without the cleared tracks — never importing
    /// them at all.
    pub fn clear_completed(&mut self) -> Vec<Effect> {
        let removed: Vec<String> = self
            .items
            .iter()
            .filter(|item| item.batch_id.is_none() && is_terminal(item.status))
            .map(|item| item.id.clone())
            .collect();

        self.items
            .retain(|item| !(item.batch_id.is_none() && is_terminal(item.status)));

        vec![Effect::ForgetMany(removed), Effect::Broadcast]
    }

    /// Promote queued items while slots are free.
    fn pump(&mut self) -> Vec<Effect> {
        if self.paused {
            return Vec::new();
        }

        let mut effects = Vec::new();

        loop {
            if self.active_count() >= MAX_CONCURRENCY {
                break;
            }

            let Some(next) = self
                .items
                .iter()
                .find(|item| item.status == DownloadQueueStatus::Queued)
                .map(|item| item.id.clone())
            else {
                break;
            };

            effects.extend(self.start(&next));
        }

        effects
    }

    /// Move one item into `active` and ask for its download.
    fn start(&mut self, id: &str) -> Vec<Effect> {
        let Some(item) = self.find_mut(id) else {
            return Vec::new();
        };

        item.status = DownloadQueueStatus::Active;
        // `started_at` is stamped by the manager, which owns the clock; the
        // state machine only marks that it has started.
        vec![Effect::Broadcast, Effect::Start(id.to_owned())]
    }

    /// Record when an item started, from the manager's clock.
    pub fn stamp_started(&mut self, id: &str, now: i64) {
        if let Some(item) = self.find_mut(id) {
            item.started_at = Some(now);
        }
    }

    /// A download finished and wrote `file_path`.
    ///
    /// The row is re-persisted rather than dropped: it names a file that exists
    /// on disk but has not been imported into the library yet, and a crash
    /// before the import must still find it on the next launch.
    pub fn finish_done(&mut self, id: &str, file_path: String, now: i64) -> Vec<Effect> {
        let mut effects = Vec::new();

        if let Some(item) = self.find_mut(id) {
            item.status = DownloadQueueStatus::Done;
            item.file_path = Some(file_path);
            item.progress = 100.0;
            item.finished_at = Some(now);
            effects.push(Effect::Persist(Box::new(item.clone())));
        }

        effects.push(Effect::Broadcast);
        effects.extend(self.pump());
        effects
    }

    /// A download failed.
    ///
    /// The persisted row is dropped: `error` carries no resume action, and
    /// keeping it would re-surface a failure the user has already been told
    /// about every time the app starts.
    pub fn finish_error(&mut self, id: &str, message: String, now: i64) -> Vec<Effect> {
        let mut effects = Vec::new();

        if let Some(item) = self.find_mut(id) {
            item.status = DownloadQueueStatus::Error;
            item.error = Some(message);
            item.finished_at = Some(now);
            effects.push(Effect::Forget(id.to_owned()));
        }

        effects.push(Effect::Broadcast);
        effects.extend(self.pump());
        effects
    }

    /// A download's child died because the user cancelled it.
    ///
    /// Deliberately distinct from [`Self::finish_error`] all the way to the
    /// renderer: a cancelled row is not a failure and must not be presented as
    /// one.
    pub fn finish_cancelled(&mut self, id: &str, now: i64) -> Vec<Effect> {
        let mut effects = Vec::new();

        if let Some(item) = self.find_mut(id) {
            item.status = DownloadQueueStatus::Canceled;
            item.finished_at = Some(now);
            effects.push(Effect::Forget(id.to_owned()));
        }

        effects.push(Effect::Broadcast);
        effects.extend(self.pump());
        effects
    }

    /// Transfer progress. Coalesced, because it arrives several times a second.
    pub fn on_progress(&mut self, id: &str, progress: f64) -> Vec<Effect> {
        let Some(item) = self.find_mut(id) else {
            return Vec::new();
        };

        item.status = DownloadQueueStatus::Active;
        item.progress = progress;
        vec![Effect::BroadcastProgress]
    }

    /// Post-processing started.
    ///
    /// A *structural* change — the row's label changes from a percentage to
    /// "converting" — so it flushes immediately rather than waiting for the
    /// progress throttle. v1 made the same distinction, and it is the reason a
    /// download appears to finish promptly rather than up to 250 ms late.
    pub fn on_converting(&mut self, id: &str) -> Vec<Effect> {
        let Some(item) = self.find_mut(id) else {
            return Vec::new();
        };

        item.status = DownloadQueueStatus::Converting;
        item.progress = 100.0;
        vec![Effect::Broadcast]
    }
}

/// Whether a status admits no further transition.
fn is_terminal(status: DownloadQueueStatus) -> bool {
    matches!(
        status,
        DownloadQueueStatus::Done | DownloadQueueStatus::Error | DownloadQueueStatus::Canceled
    )
}
