//! Serialised operations with a minimum spacing between them.
//!
//! A direct port of `apps/desktop/src/main/utils/min-interval-gate.ts`, which
//! guarantees four things this port keeps:
//!
//! 1. Only one operation runs at a time, in **FIFO** order.
//! 2. At least `min_interval` elapses between one operation **completing** and
//!    the next **starting**.
//! 3. A failing operation never stalls the queue, and still advances the clock.
//! 4. [`MinIntervalGate::bump_by`] extends the next allowed start so a
//!    server-dictated `Retry-After` can be honoured — including when it is
//!    called from *inside* the running operation, which is exactly where the
//!    429 handler calls it from.
//!
//! # Why not `governor`
//!
//! Architecture Appendix B pins `governor` for rate limiting, and §2.2 names it
//! for this subsystem. It is not used here, because it supplies none of the four
//! guarantees above: GCRA spaces *arrivals* rather than completions, its waiters
//! are unordered so FIFO is lost, and it exposes no way to push its state
//! forward for an externally-dictated penalty, which is what `bump_by` is.
//! Wrapping it would mean keeping this same mutex and deadline alongside it and
//! then never consulting its algorithm — a dependency carried for its name. The
//! pin stays useful for a future token-bucket need with real burst semantics;
//! nothing in Phase 3 has one.

use std::future::Future;
use std::sync::Mutex;
use std::time::Duration;

use shiranami_core::sync::lock_or_recover;
use tokio::time::Instant;

/// Serialises operations against one host, with a floor on their spacing.
#[derive(Debug)]
pub struct MinIntervalGate {
    min_interval: Duration,
    /// Held for the whole of an operation, which is what makes the gate
    /// one-at-a-time. `tokio::sync::Mutex` is fair, so its wait queue is the
    /// FIFO ordering the TypeScript got from chaining onto a `tail` promise.
    slot: tokio::sync::Mutex<()>,
    /// The earliest the next operation may start. `None` means "no restriction
    /// yet", the state the TypeScript spelled `nextAllowedAt = 0`.
    ///
    /// A `std::sync::Mutex` and never held across an `.await`: `bump_by` has to
    /// be callable *while* an operation is running, so this cannot be the same
    /// lock that serialises them.
    next_allowed_at: Mutex<Option<Instant>>,
}

impl MinIntervalGate {
    /// A gate enforcing `min_interval` between operations.
    pub fn new(min_interval: Duration) -> Self {
        Self {
            min_interval,
            slot: tokio::sync::Mutex::new(()),
            next_allowed_at: Mutex::new(None),
        }
    }

    /// The spacing this gate enforces.
    pub fn min_interval(&self) -> Duration {
        self.min_interval
    }

    /// Run `operation`, waiting first if the gate is still closed.
    ///
    /// Takes a closure rather than a future so nothing the operation does
    /// happens before its turn — a future built at call time would have run any
    /// eager setup while still queued.
    pub async fn run<F, Fut, T>(&self, operation: F) -> T
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = T>,
    {
        let _slot = self.slot.lock().await;

        let deadline = *lock_or_recover(&self.next_allowed_at);
        if let Some(deadline) = deadline
            && deadline > Instant::now()
        {
            tokio::time::sleep_until(deadline).await;
        }

        // Declared after `_slot` so it drops *before* it: the deadline is
        // advanced while the slot is still held, so the next waiter cannot
        // observe the gate open. A drop guard rather than a statement after the
        // await because it is the TypeScript's `finally` — it must also run
        // when the operation panics.
        let _advance = AdvanceOnDrop { gate: self };

        operation().await
    }

    /// Push the next allowed start at least `extra` into the future.
    ///
    /// Never shortens an existing wait, so a large backoff is not undone by a
    /// small one arriving after it.
    pub fn bump_by(&self, extra: Duration) {
        self.extend_to(Instant::now() + extra);
    }

    fn extend_to(&self, deadline: Instant) {
        let mut slot = lock_or_recover(&self.next_allowed_at);
        let extended = match *slot {
            Some(existing) if existing > deadline => existing,
            _ => deadline,
        };
        *slot = Some(extended);
    }
}

/// Advances the gate when the operation finishes, however it finishes.
struct AdvanceOnDrop<'gate> {
    gate: &'gate MinIntervalGate,
}

impl Drop for AdvanceOnDrop<'_> {
    fn drop(&mut self) {
        // `extend_to` rather than an assignment, so a `bump_by` issued during
        // the operation — the 429 handler's — is not clobbered by the baseline
        // interval landing afterwards.
        self.gate.extend_to(Instant::now() + self.gate.min_interval);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    /// Elapsed milliseconds since `start`, which on a paused clock is exact.
    fn elapsed_ms(start: Instant) -> u128 {
        start.elapsed().as_millis()
    }

    #[tokio::test(start_paused = true)]
    async fn run_resolves_with_the_operation_value() {
        let gate = MinIntervalGate::new(Duration::from_secs(1));
        assert_eq!(gate.run(|| async { "hello" }).await, "hello");
    }

    #[tokio::test(start_paused = true)]
    async fn the_first_call_runs_immediately() {
        let gate = MinIntervalGate::new(Duration::from_secs(1));
        let start = Instant::now();
        gate.run(|| async {}).await;
        assert_eq!(elapsed_ms(start), 0);
    }

    #[tokio::test(start_paused = true)]
    async fn a_second_call_waits_one_interval() {
        let gate = MinIntervalGate::new(Duration::from_secs(1));
        let start = Instant::now();
        let seen = Mutex::new(Vec::new());

        let record = || {
            gate.run(|| async {
                lock_or_recover(&seen).push(elapsed_ms(start));
            })
        };
        tokio::join!(record(), record());

        assert_eq!(seen.into_inner().expect("uncontended"), vec![0, 1_000]);
    }

    /// The ported "preserves order across five sequential run() calls".
    /// `tokio::join!` polls in declaration order, so the futures reach the
    /// gate's wait queue in order and the assertion is about the gate's
    /// fairness rather than about scheduling luck.
    #[tokio::test(start_paused = true)]
    async fn preserves_order_and_spacing_across_five_calls() {
        let gate = MinIntervalGate::new(Duration::from_millis(500));
        let start = Instant::now();
        let seen = Mutex::new(Vec::new());

        // Captured as a shared reference, which is `Copy`, so the per-call
        // `move` closure copies the borrow instead of taking the mutex itself.
        let recorder = &seen;
        let record = |label: u32| {
            gate.run(move || async move {
                lock_or_recover(recorder).push((label, elapsed_ms(start)));
            })
        };
        tokio::join!(record(1), record(2), record(3), record(4), record(5));

        assert_eq!(
            seen.into_inner().expect("uncontended"),
            vec![(1, 0), (2, 500), (3, 1_000), (4, 1_500), (5, 2_000)]
        );
    }

    /// A failing operation must not wedge the queue — the next caller still
    /// runs, one interval later.
    #[tokio::test(start_paused = true)]
    async fn a_failing_operation_does_not_stall_the_queue() {
        let gate = MinIntervalGate::new(Duration::from_secs(1));
        let start = Instant::now();

        let failed = gate.run(|| async { Err::<(), &str>("boom") });
        let after = gate.run(|| async { Ok::<u128, &str>(elapsed_ms(start)) });
        let (failed, after) = tokio::join!(failed, after);

        assert_eq!(failed, Err("boom"));
        assert_eq!(after, Ok(1_000));
    }

    /// The distinguishing semantic: spacing runs from **completion**, not from
    /// the previous start. An operation that takes longer than the interval
    /// still leaves a full interval behind it.
    #[tokio::test(start_paused = true)]
    async fn spacing_is_measured_from_completion_not_from_the_previous_start() {
        let gate = MinIntervalGate::new(Duration::from_millis(500));
        let start = Instant::now();

        let slow = gate.run(|| async {
            tokio::time::sleep(Duration::from_secs(2)).await;
        });
        let next = gate.run(|| async { elapsed_ms(start) });
        let (_, next) = tokio::join!(slow, next);

        assert_eq!(
            next, 2_500,
            "the interval starts when the slow call finished, at t=2000"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn bump_by_delays_the_next_call() {
        let gate = MinIntervalGate::new(Duration::from_secs(1));
        let start = Instant::now();

        gate.run(|| async {}).await;
        gate.bump_by(Duration::from_secs(5));

        assert_eq!(gate.run(|| async { elapsed_ms(start) }).await, 5_000);
    }

    /// A smaller bump arriving after a larger one must not shorten the wait.
    #[tokio::test(start_paused = true)]
    async fn a_smaller_bump_never_shortens_a_larger_one() {
        let gate = MinIntervalGate::new(Duration::from_secs(1));
        let start = Instant::now();

        gate.run(|| async {}).await;
        gate.bump_by(Duration::from_secs(10));
        gate.bump_by(Duration::from_secs(1));

        assert_eq!(gate.run(|| async { elapsed_ms(start) }).await, 10_000);
    }

    /// The case the `extend_to`-on-drop exists for: a `bump_by` issued from
    /// inside the running operation — where the 429 handler issues it — must
    /// survive the baseline interval being applied afterwards.
    #[tokio::test(start_paused = true)]
    async fn a_bump_from_inside_the_operation_survives_the_baseline_interval() {
        let gate = Arc::new(MinIntervalGate::new(Duration::from_secs(1)));
        let start = Instant::now();

        let inner = Arc::clone(&gate);
        gate.run(|| async move {
            inner.bump_by(Duration::from_secs(30));
        })
        .await;

        assert_eq!(gate.run(|| async { elapsed_ms(start) }).await, 30_000);
    }

    #[tokio::test(start_paused = true)]
    async fn two_gates_do_not_block_each_other() {
        let first = MinIntervalGate::new(Duration::from_secs(1));
        let second = MinIntervalGate::new(Duration::from_secs(1));
        let start = Instant::now();

        let (a, b) = tokio::join!(
            first.run(|| async { elapsed_ms(start) }),
            second.run(|| async { elapsed_ms(start) })
        );

        assert_eq!((a, b), (0, 0));
    }
}
