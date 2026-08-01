//! The throttle that keeps a 4 Hz playhead from becoming 4 Hz of OS traffic.
//!
//! # What v1 did
//!
//! `MediaSessionSync.hooks.ts` pushed playback state to the main process on
//! every `currentTime` change — the playback store writes it every 250 ms —
//! behind a leading-edge gate:
//!
//! ```js
//! const now = Date.now();
//! if (now - lastUpdateRef.current < 1000 && lastUpdateRef.current > 0) return;
//! lastUpdateRef.current = now;
//! ```
//!
//! Two properties are worth naming because they are ported deliberately. The
//! interval is **1000 ms**, and the `lastUpdateRef.current > 0` clause makes the
//! very first push after mount immediate regardless — which is what put a track
//! on the tray the instant the app started playing.
//!
//! # What changed, and why
//!
//! v1's gate **drops** what it rejects. Change track 200 ms after a playhead
//! tick and the tray keeps the old title for the rest of the second; stop
//! emitting entirely — pause at a moment the gate happens to be closed — and the
//! last state never lands at all. §2.2 already states the intended shape for
//! high-frequency emitters in this codebase: *"throttle + coalescing … immediate
//! on structural change"*. This gate implements exactly that. A structural
//! change ([`MediaState::is_structural_change`]) bypasses the window outright,
//! and a playhead-only update inside the window is **held** rather than dropped,
//! so the last value always reaches the OS.
//!
//! The observable rate is unchanged: still at most one push per second for a
//! steadily advancing playhead. What changes is that a track change is never
//! late and a final position is never lost.
//!
//! The clock is a parameter, not a dependency: every method takes `now`. That is
//! what lets the whole thing be tested by arithmetic rather than by sleeping.

use std::time::{Duration, Instant};

use crate::state::MediaState;

/// The shortest gap between two playhead-only pushes.
///
/// v1's literal `1000`.
pub const UPDATE_INTERVAL: Duration = Duration::from_millis(1_000);

/// What the gate decided about a submitted state.
#[derive(Debug, Clone, PartialEq)]
pub enum GateOutcome {
    /// Push this to the OS now.
    Emit(MediaState),
    /// Held until the window closes. The caller should arrange to call
    /// [`UpdateGate::flush_due`] at or after `due_at`.
    Deferred {
        /// When the held state becomes emittable.
        due_at: Instant,
    },
    /// The OS is already showing this; nothing to do.
    Unchanged,
}

/// Leading-edge throttle with coalescing, over [`MediaState`].
#[derive(Debug)]
pub struct UpdateGate {
    interval: Duration,
    emitted: Option<MediaState>,
    emitted_at: Option<Instant>,
    pending: Option<MediaState>,
}

impl Default for UpdateGate {
    fn default() -> Self {
        Self::new(UPDATE_INTERVAL)
    }
}

impl UpdateGate {
    /// A gate with a custom window. Tests use this; the app uses
    /// [`Default::default`].
    pub fn new(interval: Duration) -> Self {
        Self {
            interval,
            emitted: None,
            emitted_at: None,
            pending: None,
        }
    }

    /// Offer a new state to the gate.
    pub fn submit(&mut self, now: Instant, state: MediaState) -> GateOutcome {
        if self.emitted.as_ref() == Some(&state) {
            // Whatever was held is now stale in the only way that matters: the
            // OS already shows the value it would have been superseded by.
            self.pending = None;
            return GateOutcome::Unchanged;
        }

        let structural = self
            .emitted
            .as_ref()
            .is_none_or(|emitted| emitted.is_structural_change(&state));

        if structural || self.window_is_open(now) {
            return self.emit(now, state);
        }

        self.pending = Some(state);
        GateOutcome::Deferred {
            due_at: self.due_at(now),
        }
    }

    /// Emit the held state if its window has closed.
    ///
    /// Returns `None` when nothing is held or the window is still open — both of
    /// which make an early or spurious tick harmless, so the shell may call this
    /// on a plain interval without tracking whether it needs to.
    pub fn flush_due(&mut self, now: Instant) -> Option<MediaState> {
        if !self.window_is_open(now) {
            return None;
        }

        let pending = self.pending.take()?;

        match self.emit(now, pending) {
            GateOutcome::Emit(state) => Some(state),
            GateOutcome::Deferred { .. } | GateOutcome::Unchanged => None,
        }
    }

    /// When the held state becomes emittable, if one is held.
    ///
    /// Nothing can be held before something has been emitted — the first
    /// submission always emits — so an absent `emitted_at` means an absent
    /// pending state too.
    pub fn due_at_pending(&self) -> Option<Instant> {
        let emitted_at = self.emitted_at?;
        self.pending.as_ref().map(|_| emitted_at + self.interval)
    }

    /// Forget everything, so the next submission is treated as the first.
    ///
    /// Used when the backend is re-attached: the OS surface has been torn down
    /// and rebuilt, so nothing may be assumed about what it shows.
    pub fn reset(&mut self) {
        self.emitted = None;
        self.emitted_at = None;
        self.pending = None;
    }

    fn window_is_open(&self, now: Instant) -> bool {
        self.emitted_at
            .is_none_or(|emitted_at| now.duration_since(emitted_at) >= self.interval)
    }

    fn due_at(&self, now: Instant) -> Instant {
        self.emitted_at
            .map_or(now, |emitted_at| emitted_at + self.interval)
    }

    fn emit(&mut self, now: Instant, state: MediaState) -> GateOutcome {
        self.emitted = Some(state.clone());
        self.emitted_at = Some(now);
        self.pending = None;
        GateOutcome::Emit(state)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::playing;

    fn loaded(current_time: f64) -> MediaState {
        MediaState::Loaded(playing(current_time))
    }

    fn at(base: Instant, millis: u64) -> Instant {
        base + Duration::from_millis(millis)
    }

    fn emitted(outcome: GateOutcome) -> Option<MediaState> {
        match outcome {
            GateOutcome::Emit(state) => Some(state),
            GateOutcome::Deferred { .. } | GateOutcome::Unchanged => None,
        }
    }

    #[test]
    fn the_interval_is_v1s_one_second() {
        assert_eq!(UPDATE_INTERVAL, Duration::from_millis(1_000));
    }

    /// v1's `lastUpdateRef.current > 0` bypass: the first push always lands.
    #[test]
    fn the_first_submission_always_emits() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();

        assert_eq!(emitted(gate.submit(base, loaded(0.0))), Some(loaded(0.0)));
    }

    #[test]
    fn a_playhead_tick_inside_the_window_is_held_not_dropped() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();
        gate.submit(base, loaded(0.0));

        let outcome = gate.submit(at(base, 250), loaded(0.25));
        assert_eq!(
            outcome,
            GateOutcome::Deferred {
                due_at: at(base, 1_000)
            }
        );
        assert!(
            gate.flush_due(at(base, 999)).is_none(),
            "the window is still open"
        );
        assert_eq!(gate.flush_due(at(base, 1_000)), Some(loaded(0.25)));
    }

    /// The point of coalescing: three ticks inside one window produce one push,
    /// carrying the newest value rather than the oldest.
    #[test]
    fn several_held_ticks_collapse_into_the_newest() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();
        gate.submit(base, loaded(0.0));

        for (offset, position) in [(250, 0.25), (500, 0.5), (750, 0.75)] {
            assert!(matches!(
                gate.submit(at(base, offset), loaded(position)),
                GateOutcome::Deferred { .. }
            ));
        }

        assert_eq!(gate.flush_due(at(base, 1_000)), Some(loaded(0.75)));
        assert_eq!(gate.flush_due(at(base, 2_500)), None, "only one push");
    }

    #[test]
    fn a_tick_after_the_window_emits_directly() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();
        gate.submit(base, loaded(0.0));

        assert_eq!(
            emitted(gate.submit(at(base, 1_000), loaded(1.0))),
            Some(loaded(1.0))
        );
    }

    /// The v1 behaviour this gate deliberately does not copy: a track change
    /// 200 ms after a playhead tick left the tray and the SMTC flyout showing
    /// the previous song for the rest of the second.
    #[test]
    fn a_track_change_inside_the_window_jumps_the_queue() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();
        gate.submit(base, loaded(0.0));

        let mut next = playing(0.0);
        next.title = "Another Song".to_owned();

        assert_eq!(
            emitted(gate.submit(at(base, 200), MediaState::Loaded(next.clone()))),
            Some(MediaState::Loaded(next))
        );
    }

    #[test]
    fn a_pause_inside_the_window_jumps_the_queue() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();
        gate.submit(base, loaded(10.0));

        let mut paused = playing(10.0);
        paused.is_playing = false;

        assert!(matches!(
            gate.submit(at(base, 100), MediaState::Loaded(paused)),
            GateOutcome::Emit(_)
        ));
    }

    #[test]
    fn clearing_inside_the_window_jumps_the_queue() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();
        gate.submit(base, loaded(10.0));

        assert_eq!(
            emitted(gate.submit(at(base, 100), MediaState::Cleared)),
            Some(MediaState::Cleared)
        );
    }

    /// A structural emit resets the window, so the throttle applies from the
    /// track change onward rather than from the tick before it.
    #[test]
    fn a_structural_emit_restarts_the_window() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();
        gate.submit(base, loaded(0.0));
        gate.submit(at(base, 900), MediaState::Cleared);

        assert!(matches!(
            gate.submit(at(base, 950), loaded(0.0)),
            GateOutcome::Emit(_)
        ));
        assert!(
            matches!(
                gate.submit(at(base, 1_100), loaded(0.1)),
                GateOutcome::Deferred { .. }
            ),
            "1100 ms is only 150 ms after the last emit"
        );
    }

    #[test]
    fn resubmitting_the_displayed_state_changes_nothing() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();
        gate.submit(base, loaded(5.0));

        assert_eq!(
            gate.submit(at(base, 2_000), loaded(5.0)),
            GateOutcome::Unchanged
        );
    }

    /// A tick is held, then the playhead is dragged back to where the OS
    /// already has it. Flushing the held value would move the scrubber to a
    /// position nothing asked for.
    #[test]
    fn a_return_to_the_displayed_state_discards_the_held_one() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();
        gate.submit(base, loaded(5.0));
        gate.submit(at(base, 250), loaded(5.25));

        assert_eq!(
            gate.submit(at(base, 500), loaded(5.0)),
            GateOutcome::Unchanged
        );
        assert_eq!(gate.flush_due(at(base, 2_000)), None);
    }

    #[test]
    fn flushing_with_nothing_held_is_a_no_op() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();

        assert_eq!(gate.flush_due(base), None);
        gate.submit(base, loaded(0.0));
        assert_eq!(gate.flush_due(at(base, 5_000)), None);
    }

    #[test]
    fn the_due_instant_is_reported_while_something_is_held() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();
        gate.submit(base, loaded(0.0));
        assert_eq!(gate.due_at_pending(), None);

        gate.submit(at(base, 250), loaded(0.25));
        assert_eq!(gate.due_at_pending(), Some(at(base, 1_000)));
    }

    /// After a re-attach the OS surface is new, so the gate must not believe it
    /// is already showing anything.
    #[test]
    fn a_reset_makes_the_next_submission_the_first_again() {
        let base = Instant::now();
        let mut gate = UpdateGate::default();
        gate.submit(base, loaded(5.0));
        gate.reset();

        assert_eq!(
            emitted(gate.submit(at(base, 10), loaded(5.0))),
            Some(loaded(5.0))
        );
    }
}
