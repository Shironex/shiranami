//! The 5-minute per-`source:code` de-duplication gate.
//!
//! Ported from `apps/desktop/src/main/app/system-notice.ts`. Architecture §2.2
//! (subsystem 10) lists exactly one requirement for this port — *"5-min
//! per-`source:code` dedup preserved"* — because the cooldown is what stands
//! between a backing-off Discord reconnect loop and a toast every five seconds.
//!
//! Core owns the gate but not the transport: emitting a Tauri event from a
//! rank-0 crate would invert the layering, so delivery goes through
//! [`NoticeSink`], which the composition root implements in Phase 16.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::notice::types::{SystemNotice, SystemNoticeSource};
use crate::sync::lock_or_recover;

/// How long a `source:code` pair stays suppressed after being emitted.
pub const DEFAULT_COOLDOWN: Duration = Duration::from_secs(5 * 60);

/// Where a notice goes once the gate lets it through.
///
/// v1 called `sendToRenderer`, which returned `false` without throwing when no
/// window existed yet. Delivery being fire-and-forget is why this returns `()`:
/// a notice that arrives before the window does is dropped, deliberately.
pub trait NoticeSink: Send + Sync {
    /// Deliver a notice that has passed the cooldown.
    fn deliver(&self, notice: &SystemNotice);
}

/// Suppresses repeats of the same `source:code` within the cooldown window.
pub struct NoticeGate<S: NoticeSink> {
    cooldown: Duration,
    last_emitted: Mutex<HashMap<String, Instant>>,
    sink: S,
}

impl<S: NoticeSink> NoticeGate<S> {
    /// Build a gate with the ported 5-minute cooldown.
    pub fn new(sink: S) -> Self {
        Self::with_cooldown(sink, DEFAULT_COOLDOWN)
    }

    /// Build a gate with a custom cooldown.
    pub fn with_cooldown(sink: S, cooldown: Duration) -> Self {
        Self {
            cooldown,
            last_emitted: Mutex::new(HashMap::new()),
            sink,
        }
    }

    /// Emit `notice` unless an identical `source:code` went out recently.
    ///
    /// Returns whether it was delivered.
    ///
    /// The timestamp is recorded **before** delivery, and recorded even though
    /// delivery may drop the notice for want of a window. That ordering is
    /// ported deliberately: it means a burst arriving during startup consumes
    /// the cooldown rather than queueing up to fire the instant a window
    /// appears.
    ///
    /// One thing the port drops: v1 clamped the elapsed time with
    /// `Math.max(0, now - last)` so that a backwards wall-clock jump suppressed
    /// rather than released. [`Instant`] is monotonic, so it cannot run
    /// backwards and the clamp has nothing left to defend against.
    pub fn emit(&self, notice: &SystemNotice) -> bool {
        let key = notice.dedup_key();
        {
            let mut last_emitted = lock_or_recover(&self.last_emitted);
            if let Some(last) = last_emitted.get(&key)
                && last.elapsed() < self.cooldown
            {
                return false;
            }
            last_emitted.insert(key, Instant::now());
        }

        self.sink.deliver(notice);
        true
    }

    /// Forget the cooldown for one `source:code`.
    ///
    /// Called when a subsystem recovers — v1 reset the Discord notice both on a
    /// successful `ready` and on an explicit disconnect — so the next failure
    /// surfaces immediately instead of waiting out a window it earned before
    /// the problem was fixed.
    pub fn reset(&self, source: SystemNoticeSource, code: &str) {
        let key = SystemNotice::warn(source, code).dedup_key();
        lock_or_recover(&self.last_emitted).remove(&key);
    }

    /// Forget every cooldown.
    pub fn reset_all(&self) {
        lock_or_recover(&self.last_emitted).clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notice::types::codes;
    use std::sync::Arc;

    #[derive(Default)]
    struct Recorder(Mutex<Vec<SystemNotice>>);

    impl NoticeSink for Arc<Recorder> {
        fn deliver(&self, notice: &SystemNotice) {
            lock_or_recover(&self.0).push(notice.clone());
        }
    }

    fn gate(cooldown: Duration) -> (NoticeGate<Arc<Recorder>>, Arc<Recorder>) {
        let recorder = Arc::new(Recorder::default());
        (
            NoticeGate::with_cooldown(Arc::clone(&recorder), cooldown),
            recorder,
        )
    }

    fn discord_failure() -> SystemNotice {
        SystemNotice::warn(SystemNoticeSource::Discord, codes::DISCORD_LOGIN_FAILED)
    }

    #[test]
    fn delivers_the_first_notice_verbatim() {
        let (gate, recorder) = gate(DEFAULT_COOLDOWN);
        assert!(gate.emit(&discord_failure()));
        assert_eq!(*lock_or_recover(&recorder.0), vec![discord_failure()]);
    }

    /// The property the module exists for: Discord's reconnect backoff starts at
    /// five seconds, so without this the user gets a toast every five seconds.
    #[test]
    fn suppresses_a_repeat_of_the_same_source_and_code() {
        let (gate, recorder) = gate(DEFAULT_COOLDOWN);
        assert!(gate.emit(&discord_failure()));
        assert!(!gate.emit(&discord_failure()));
        assert!(!gate.emit(&discord_failure()));
        assert_eq!(lock_or_recover(&recorder.0).len(), 1);
    }

    #[test]
    fn does_not_dedupe_across_different_codes() {
        let (gate, recorder) = gate(DEFAULT_COOLDOWN);
        assert!(gate.emit(&discord_failure()));
        assert!(gate.emit(&SystemNotice::warn(
            SystemNoticeSource::Discord,
            "someOtherCode"
        )));
        assert_eq!(lock_or_recover(&recorder.0).len(), 2);
    }

    #[test]
    fn does_not_dedupe_across_different_sources() {
        let (gate, recorder) = gate(DEFAULT_COOLDOWN);
        assert!(gate.emit(&SystemNotice::warn(SystemNoticeSource::Discord, "x")));
        assert!(gate.emit(&SystemNotice::warn(SystemNoticeSource::AlbumArt, "x")));
        assert_eq!(lock_or_recover(&recorder.0).len(), 2);
    }

    #[test]
    fn lets_a_notice_through_once_the_cooldown_elapses() {
        let (gate, recorder) = gate(Duration::from_millis(30));
        assert!(gate.emit(&discord_failure()));
        assert!(!gate.emit(&discord_failure()));
        std::thread::sleep(Duration::from_millis(45));
        assert!(gate.emit(&discord_failure()));
        assert_eq!(lock_or_recover(&recorder.0).len(), 2);
    }

    /// A subsystem that recovers must not have to wait out a window it earned
    /// before the problem was fixed.
    #[test]
    fn reset_clears_the_cooldown_for_one_pair() {
        let (gate, recorder) = gate(DEFAULT_COOLDOWN);
        assert!(gate.emit(&discord_failure()));
        assert!(!gate.emit(&discord_failure()));

        gate.reset(SystemNoticeSource::Discord, codes::DISCORD_LOGIN_FAILED);

        assert!(gate.emit(&discord_failure()));
        assert_eq!(lock_or_recover(&recorder.0).len(), 2);
    }

    #[test]
    fn reset_leaves_other_pairs_suppressed() {
        let (gate, _recorder) = gate(DEFAULT_COOLDOWN);
        gate.emit(&discord_failure());
        gate.emit(&SystemNotice::warn(SystemNoticeSource::AlbumArt, "x"));

        gate.reset(SystemNoticeSource::Discord, codes::DISCORD_LOGIN_FAILED);

        assert!(gate.emit(&discord_failure()));
        assert!(!gate.emit(&SystemNotice::warn(SystemNoticeSource::AlbumArt, "x")));
    }

    /// Ported ordering: the cooldown is consumed even when nothing receives the
    /// notice, so a startup burst cannot queue up behind a missing window.
    #[test]
    fn a_dropped_delivery_still_consumes_the_cooldown() {
        struct Blackhole;
        impl NoticeSink for Blackhole {
            fn deliver(&self, _notice: &SystemNotice) {}
        }

        let gate = NoticeGate::with_cooldown(Blackhole, DEFAULT_COOLDOWN);
        assert!(gate.emit(&discord_failure()));
        assert!(
            !gate.emit(&discord_failure()),
            "the window is consumed whether or not anyone was listening"
        );
    }
}
