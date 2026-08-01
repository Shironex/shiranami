//! The single-slot cancel.
//!
//! Ported from the module-level `activeEnrichAbort` in
//! `apps/desktop/src/main/ipc/metadata-enrich.ts`.
//!
//! There is exactly **one** slot for the whole enrich subsystem. A bulk run and
//! a preview both claim it, so they are mutually exclusive, and `cancel` aborts
//! whatever currently holds it. That bluntness is deliberate: the renderer has
//! one cancel button and one progress bar, and a second concurrent run would
//! have nowhere to report.
//!
//! Two details from v1 that look incidental and are not:
//!
//! - **Releasing checks identity.** A run that finishes late must not clear a
//!   *newer* run's slot. v1: `if (activeEnrichAbort === abort)`.
//! - **Cancelling while idle is a no-op, not an error.** v1's comment says why:
//!   a stale flag left set by a mistimed cancel would poison the next run.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tokio_util::sync::CancellationToken;

use crate::error::{MetadataError, Result};

/// Holds the one in-flight enrich run, if any.
#[derive(Debug, Default)]
pub struct EnrichSlot {
    // Plain `std::sync::Mutex`: it guards a small tuple and is never held
    // across an await, which is the workspace rule for choosing it over
    // tokio's.
    active: Mutex<Option<Run>>,
    generations: AtomicU64,
}

/// The run currently holding the slot.
#[derive(Debug)]
struct Run {
    token: CancellationToken,
    /// Monotonic run number, so a guard can tell whether the slot is still
    /// *its* run's before clearing it. v1 compared the `AbortController` by
    /// reference; a counter says the same thing without depending on the
    /// token type having an identity comparison.
    generation: u64,
}

impl EnrichSlot {
    /// An empty slot.
    pub fn new() -> Self {
        Self::default()
    }

    /// Take the slot, or fail with [`MetadataError::EnrichBusy`].
    ///
    /// The returned guard releases the slot when dropped, so an early return or
    /// a panic in the run cannot strand it.
    pub fn claim(self: &Arc<Self>) -> Result<EnrichGuard> {
        let mut active = lock(&self.active);

        if active.is_some() {
            return Err(MetadataError::EnrichBusy);
        }

        let token = CancellationToken::new();
        let generation = self.generations.fetch_add(1, Ordering::SeqCst);
        *active = Some(Run {
            token: token.clone(),
            generation,
        });

        Ok(EnrichGuard {
            slot: Arc::clone(self),
            token,
            generation,
        })
    }

    /// Cancel whatever holds the slot. A no-op when nothing does.
    pub fn cancel(&self) {
        if let Some(run) = lock(&self.active).as_ref() {
            run.token.cancel();
        } else {
            tracing::debug!("enrich cancel requested while idle; ignoring");
        }
    }

    /// Whether a run currently holds the slot.
    pub fn is_busy(&self) -> bool {
        lock(&self.active).is_some()
    }
}

/// Proof that the caller holds the enrich slot.
#[derive(Debug)]
pub struct EnrichGuard {
    slot: Arc<EnrichSlot>,
    token: CancellationToken,
    generation: u64,
}

impl EnrichGuard {
    /// The cancellation token for this run.
    pub fn token(&self) -> &CancellationToken {
        &self.token
    }
}

impl Drop for EnrichGuard {
    fn drop(&mut self) {
        let mut active = lock(&self.slot.active);

        // Identity check: a run that finishes after a newer one started must
        // not clear the newer one's slot.
        if active
            .as_ref()
            .is_some_and(|current| current.generation == self.generation)
        {
            *active = None;
        }
    }
}

/// `lock_or_recover` for this module's one mutex.
///
/// The workspace forbids `.expect("poisoned")`: the guarded value is a plain
/// `Option` with no invariant a panic could have broken, so recovering is
/// strictly better than turning one crash into two.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_claim_is_refused_while_the_first_is_held() {
        let slot = Arc::new(EnrichSlot::new());
        let _first = slot.claim().expect("the first claim succeeds");

        let error = slot.claim().expect_err("the second claim is refused");

        assert!(matches!(error, MetadataError::EnrichBusy));
    }

    #[test]
    fn the_slot_is_reusable_once_the_guard_drops() {
        let slot = Arc::new(EnrichSlot::new());

        drop(slot.claim().expect("the first claim succeeds"));

        assert!(!slot.is_busy());
        slot.claim().expect("the slot is free again");
    }

    #[test]
    fn cancelling_marks_the_active_run() {
        let slot = Arc::new(EnrichSlot::new());
        let guard = slot.claim().expect("the claim succeeds");

        assert!(!guard.token().is_cancelled());
        slot.cancel();
        assert!(guard.token().is_cancelled());
    }

    #[test]
    fn cancelling_while_idle_does_not_poison_the_next_run() {
        // v1's regression test: a stale boolean flag left set by a mistimed
        // cancel made the *next* run start pre-cancelled.
        let slot = Arc::new(EnrichSlot::new());

        slot.cancel();

        let guard = slot.claim().expect("the claim succeeds");
        assert!(
            !guard.token().is_cancelled(),
            "a new run must not inherit a cancel aimed at nothing"
        );
    }

    #[test]
    fn a_late_finishing_run_does_not_release_a_newer_ones_slot() {
        // The identity check. Without it, run 1's cleanup frees the slot while
        // run 2 is still going, and a third run could start alongside it.
        let slot = Arc::new(EnrichSlot::new());

        let first = slot.claim().expect("the first claim succeeds");
        // Simulate v1's ordering: the slot is handed to a newer run before the
        // older one's finalizer gets to run.
        {
            let mut active = lock(&slot.active);
            *active = Some(Run {
                token: CancellationToken::new(),
                generation: slot.generations.fetch_add(1, Ordering::SeqCst),
            });
        }

        drop(first);

        assert!(
            slot.is_busy(),
            "the older run's cleanup cleared a slot it no longer owned"
        );
    }

    #[test]
    fn cancelling_after_a_run_finished_is_harmless() {
        let slot = Arc::new(EnrichSlot::new());
        drop(slot.claim().expect("the claim succeeds"));

        slot.cancel();

        assert!(!slot.is_busy());
    }
}
