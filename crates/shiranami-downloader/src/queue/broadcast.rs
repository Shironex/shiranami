//! Getting snapshots to the renderer without flooding it.
//!
//! A download in flight reports progress several times a second, and three run
//! at once. Emitting a full snapshot for each is R24 — the renderer spends its
//! frame budget deserialising queue states nobody sees.
//!
//! v1's answer, kept exactly: progress-only changes coalesce into a trailing
//! 250 ms tick, and any *structural* change — a status transition, an enqueue,
//! a cancel — flushes immediately **and cancels the pending tick**, because the
//! snapshot it just sent already contains everything the tick would have.
//!
//! The distinction is the whole point. Throttling everything would make a
//! finished download appear to hang for a quarter second; throttling nothing
//! would make a three-download run stutter.

use std::sync::Mutex;
use std::time::Duration;

use shiranami_core::models::DownloadQueueSnapshot;

/// The trailing window progress-only updates coalesce into. v1's value.
pub const PROGRESS_THROTTLE: Duration = Duration::from_millis(250);

/// Receives queue snapshots.
///
/// Phase 14 implements this over a Tauri event; tests implement it over a
/// vector.
pub trait SnapshotSink: Send + Sync + 'static {
    /// One snapshot, ready to cross to the renderer.
    fn emit(&self, snapshot: DownloadQueueSnapshot);
}

/// A sink that discards everything, for a queue nobody is watching.
#[derive(Debug, Default)]
pub struct NoSink;

impl SnapshotSink for NoSink {
    fn emit(&self, _snapshot: DownloadQueueSnapshot) {}
}

/// Holds the pending progress tick, so a structural flush can cancel it.
#[derive(Default)]
pub struct Throttle {
    pending: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl Throttle {
    /// A throttle with no tick scheduled.
    pub fn new() -> Self {
        Self::default()
    }

    /// Cancel any pending tick.
    ///
    /// Called before every structural emit. `abort` on a handle whose task has
    /// already run is a no-op, so there is no race to lose here.
    pub fn cancel(&self) {
        if let Some(handle) = self
            .pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
        {
            handle.abort();
        }
    }

    /// Schedule a tick, unless one is already pending.
    ///
    /// Trailing rather than leading: the tick fires 250 ms after the *first*
    /// progress update of a burst and carries whatever the state holds by then,
    /// which is the freshest value rather than the stalest.
    pub fn schedule<F>(&self, tick: F)
    where
        F: FnOnce() + Send + 'static,
    {
        let mut pending = self
            .pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if pending.as_ref().is_some_and(|handle| !handle.is_finished()) {
            return;
        }

        *pending = Some(tokio::spawn(async move {
            tokio::time::sleep(PROGRESS_THROTTLE).await;
            tick();
        }));
    }
}

impl std::fmt::Debug for Throttle {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Throttle")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn a_burst_of_progress_produces_one_tick() {
        let throttle = Throttle::new();
        let ticks = Arc::new(AtomicUsize::new(0));

        for _ in 0..50 {
            let ticks = Arc::clone(&ticks);
            throttle.schedule(move || {
                ticks.fetch_add(1, Ordering::SeqCst);
            });
        }

        tokio::time::sleep(PROGRESS_THROTTLE * 2).await;

        assert_eq!(
            ticks.load(Ordering::SeqCst),
            1,
            "fifty progress updates inside one window must cost one snapshot"
        );
    }

    #[tokio::test]
    async fn a_structural_flush_cancels_the_pending_tick() {
        let throttle = Throttle::new();
        let ticks = Arc::new(AtomicUsize::new(0));

        let counter = Arc::clone(&ticks);
        throttle.schedule(move || {
            counter.fetch_add(1, Ordering::SeqCst);
        });
        throttle.cancel();

        tokio::time::sleep(PROGRESS_THROTTLE * 2).await;

        assert_eq!(
            ticks.load(Ordering::SeqCst),
            0,
            "the structural emit already carried everything the tick would have"
        );
    }

    #[tokio::test]
    async fn a_second_burst_after_a_tick_schedules_again() {
        let throttle = Throttle::new();
        let ticks = Arc::new(AtomicUsize::new(0));

        for _ in 0..2 {
            let counter = Arc::clone(&ticks);
            throttle.schedule(move || {
                counter.fetch_add(1, Ordering::SeqCst);
            });
            tokio::time::sleep(PROGRESS_THROTTLE * 2).await;
        }

        assert_eq!(ticks.load(Ordering::SeqCst), 2);
    }
}
