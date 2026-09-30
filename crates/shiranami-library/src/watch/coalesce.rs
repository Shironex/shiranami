//! Turning a stream of changes into one batch per folder.
//!
//! Pure: time arrives as an argument and the filesystem as a probe closure, so
//! every rule below is tested over synthetic events with no watcher, no sleep
//! and no temp dir.
//!
//! # Two gates, both per folder
//!
//! 1. **Quiet window.** A folder is not reported until [`Timing::quiet`] has
//!    passed without a new change in it. A 500-file copy is 500 creates and
//!    thousands of writes, and this is what makes it one batch rather than a
//!    rescan per file.
//! 2. **Size stability.** Every audio file written during the window must also
//!    have stopped changing: the same length and modification time on two
//!    probes at least [`Timing::stable_for`] apart. Without it a large copy that
//!    pauses (a slow network share, a USB stick) would be imported half-written,
//!    and its tags read from a truncated file.
//!
//! A folder whose files are all settled, or gone, is emitted once and forgotten.
//!
//! # Why there is no maximum wait
//!
//! A cap on how long a folder may stay pending would bound latency during a
//! long copy, but the rescan that follows reads the *whole* folder, including
//! whatever file is still being written. So a forced batch mid-copy imports
//! exactly the half-written file the second gate exists to hold back. The copy
//! ends, the folder goes quiet, and one batch covers all of it.
//!
//! The one exception is a file that never settles (a recorder appending for an
//! hour, a handle leaked open). Its give-up clock runs from when it was first
//! seen and is checked on **every** tick, quiet window or not, because a file
//! that is written continuously also keeps its folder from ever going quiet.
//! After [`Timing::give_up_after`] the folder is reported anyway and the stall
//! is logged, so a continuous writer delays that folder's other changes by at
//! most that long rather than forever.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use super::filter::Change;

/// The coalescer's clock settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Timing {
    /// How long a folder must go without a change before it is reported.
    pub quiet: Duration,
    /// How long a written file's size must hold still.
    pub stable_for: Duration,
    /// How long a file may keep changing before it stops holding its folder.
    pub give_up_after: Duration,
    /// How often the service wakes to check. Not used by the coalescer itself,
    /// kept here so one value configures the whole watcher.
    pub tick: Duration,
    /// How often every existing root is re-watched, if at all. See
    /// `watch::worker` for why this is on for Windows and Linux only by
    /// default.
    pub rearm: Option<Duration>,
}

impl Timing {
    /// Production values.
    ///
    /// Two seconds of quiet is long enough to span the gap between files in a
    /// Finder or Explorer copy and short enough that a single dropped file
    /// appears while the user is still looking. The give-up bound is generous:
    /// a large lossless album over a slow share can take minutes per file.
    pub const DEFAULT: Self = Self {
        quiet: Duration::from_secs(2),
        stable_for: Duration::from_secs(1),
        give_up_after: Duration::from_secs(10 * 60),
        tick: Duration::from_millis(500),
        rearm: if cfg!(any(windows, target_os = "linux")) {
            Some(Duration::from_secs(5 * 60))
        } else {
            None
        },
    };
}

impl Default for Timing {
    fn default() -> Self {
        Self::DEFAULT
    }
}

/// What a probe learned about a written file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Probe {
    /// The file is no longer there. Nothing left to wait for.
    Gone,
    /// The file exists but cannot be opened, which on Windows is what a file
    /// another process is still writing with an exclusive handle looks like.
    Busy,
    /// The file's current length and modification time.
    Ready(Fingerprint),
}

/// What "has this file stopped changing?" compares.
///
/// Length alone is not enough on Windows, where a copy may set the final length
/// up front and fill the bytes in afterwards.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Fingerprint {
    /// Length in bytes.
    pub len: u64,
    /// Last modification time, where the platform reports one.
    pub modified: Option<SystemTime>,
}

/// Where one written file stands.
#[derive(Debug, Clone, Copy)]
struct Sighting {
    /// The last fingerprint probed, if any probe has succeeded yet.
    fingerprint: Option<Fingerprint>,
    /// When the fingerprint (or the last write event) last changed.
    since: Instant,
    /// When the file was first written in this batch, for the give-up bound.
    first_seen: Instant,
}

/// One folder with changes not yet reported.
#[derive(Debug, Default)]
struct Pending {
    last_change: Option<Instant>,
    files: HashMap<PathBuf, Sighting>,
}

/// The per-folder batching state. See the module docs.
#[derive(Debug, Default)]
pub struct Coalescer {
    timing: Timing,
    folders: BTreeMap<String, Pending>,
}

impl Coalescer {
    /// An empty coalescer with the given clock settings.
    pub fn new(timing: Timing) -> Self {
        Self {
            timing,
            folders: BTreeMap::new(),
        }
    }

    /// Note a change in `folder_id` at `now`.
    ///
    /// A write to a file already being tracked resets its stability clock, so a
    /// file that is still growing between probes is caught by its events as
    /// well as by its size.
    pub fn record(&mut self, folder_id: &str, change: Change, now: Instant) {
        let pending = self.folders.entry(folder_id.to_owned()).or_default();
        pending.last_change = Some(now);

        if let Change::Written(path) = change {
            pending
                .files
                .entry(path)
                .and_modify(|sighting| sighting.since = now)
                .or_insert(Sighting {
                    fingerprint: None,
                    since: now,
                    first_seen: now,
                });
        }
    }

    /// Mark every folder in `folder_ids` changed, as though by a settled event.
    ///
    /// For the backend's "events were dropped, rescan" signal, where there is
    /// no path to attribute.
    pub fn record_all<'a>(&mut self, folder_ids: impl IntoIterator<Item = &'a str>, now: Instant) {
        for id in folder_ids {
            self.record(id, Change::Settled, now);
        }
    }

    /// Stop tracking a folder, for when it stops being watched.
    pub fn forget(&mut self, folder_id: &str) {
        self.folders.remove(folder_id);
    }

    /// Whether anything is waiting to be reported.
    pub fn is_idle(&self) -> bool {
        self.folders.is_empty()
    }

    /// The folders ready to report at `now`, in id order, removed from the
    /// pending set.
    ///
    /// `probe` is called only for folders past their quiet window, so a storm
    /// in progress costs no filesystem reads. The give-up bound is checked for
    /// every folder, quiet or not: see the module docs.
    pub fn drain_due(
        &mut self,
        now: Instant,
        mut probe: impl FnMut(&Path) -> Probe,
    ) -> Vec<String> {
        let timing = self.timing;
        let mut due = Vec::new();

        for (id, pending) in &mut self.folders {
            if let Some(stalled) = stalled_file(pending, now, &timing) {
                tracing::warn!(
                    path = %stalled.display(),
                    "a watched file kept changing; reporting its folder without waiting for it"
                );
                due.push(id.clone());
                continue;
            }

            let quiet = pending
                .last_change
                .is_some_and(|last| now.saturating_duration_since(last) >= timing.quiet);
            if !quiet {
                continue;
            }

            pending
                .files
                .retain(|path, sighting| !settle(path, sighting, now, &timing, &mut probe));

            if pending.files.is_empty() {
                due.push(id.clone());
            }
        }

        for id in &due {
            self.folders.remove(id);
        }
        due
    }
}

/// A file in `pending` that has been changing for longer than the give-up bound.
fn stalled_file<'a>(pending: &'a Pending, now: Instant, timing: &Timing) -> Option<&'a Path> {
    pending
        .files
        .iter()
        .find(|(_, sighting)| {
            now.saturating_duration_since(sighting.first_seen) >= timing.give_up_after
        })
        .map(|(path, _)| path.as_path())
}

/// Probe one written file and say whether it no longer holds its folder back.
fn settle(
    path: &Path,
    sighting: &mut Sighting,
    now: Instant,
    timing: &Timing,
    probe: &mut impl FnMut(&Path) -> Probe,
) -> bool {
    match probe(path) {
        Probe::Gone => true,
        Probe::Busy => false,
        Probe::Ready(fingerprint) if sighting.fingerprint == Some(fingerprint) => {
            now.saturating_duration_since(sighting.since) >= timing.stable_for
        }
        Probe::Ready(fingerprint) => {
            sighting.fingerprint = Some(fingerprint);
            sighting.since = now;
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TIMING: Timing = Timing {
        quiet: Duration::from_secs(2),
        stable_for: Duration::from_secs(1),
        give_up_after: Duration::from_secs(60),
        tick: Duration::from_millis(500),
        rearm: None,
    };

    fn at(start: Instant, millis: u64) -> Instant {
        start + Duration::from_millis(millis)
    }

    fn size(len: u64) -> Probe {
        Probe::Ready(Fingerprint {
            len,
            modified: None,
        })
    }

    fn written(path: &str) -> Change {
        Change::Written(PathBuf::from(path))
    }

    #[test]
    fn the_default_rearms_where_a_watch_can_be_lost_silently() {
        // Windows drops watches on errors and Linux loses them with an unmounted
        // or replaced root; FSEvents keeps its stream.
        #[cfg(any(windows, target_os = "linux"))]
        assert!(Timing::DEFAULT.rearm.is_some());
        #[cfg(target_os = "macos")]
        assert!(Timing::DEFAULT.rearm.is_none());
    }

    #[test]
    fn a_folder_is_reported_only_after_its_quiet_window() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(TIMING);

        coalescer.record("a", Change::Settled, start);

        assert!(
            coalescer
                .drain_due(at(start, 1_999), |_| Probe::Gone)
                .is_empty()
        );
        assert_eq!(
            coalescer.drain_due(at(start, 2_000), |_| Probe::Gone),
            ["a"]
        );
        assert!(coalescer.is_idle(), "a reported folder is forgotten");
        assert!(
            coalescer
                .drain_due(at(start, 9_000), |_| Probe::Gone)
                .is_empty()
        );
    }

    #[test]
    fn a_storm_is_one_batch_per_folder() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(TIMING);

        // Five hundred files, one every 100 ms, into two folders.
        for i in 0..500u64 {
            let folder = if i % 2 == 0 { "a" } else { "b" };
            coalescer.record(folder, written(&format!("/m/{i}.mp3")), at(start, i * 100));
            assert!(
                coalescer
                    .drain_due(at(start, i * 100), |_| size(1))
                    .is_empty(),
                "nothing is reported while the copy is still arriving"
            );
        }

        let end = 499 * 100;
        // First probe after the window records each size, the next confirms it.
        assert!(
            coalescer
                .drain_due(at(start, end + 2_000), |_| size(1))
                .is_empty()
        );
        assert_eq!(
            coalescer.drain_due(at(start, end + 3_000), |_| size(1)),
            ["a", "b"]
        );
    }

    #[test]
    fn a_growing_file_holds_its_folder_until_its_size_settles() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(TIMING);
        coalescer.record("a", written("/m/big.flac"), start);

        let mut len = 0;
        let mut grow = |_: &Path| {
            len += 1_000;
            size(len)
        };
        for tick in 0..20 {
            assert!(
                coalescer
                    .drain_due(at(start, 2_000 + tick * 500), &mut grow)
                    .is_empty(),
                "tick {tick}: a file whose size keeps changing is not reported"
            );
        }

        let settled = at(start, 12_000);
        assert!(coalescer.drain_due(settled, |_| size(7)).is_empty());
        assert!(
            coalescer
                .drain_due(settled + Duration::from_millis(999), |_| size(7))
                .is_empty(),
            "stable, but not for long enough yet"
        );
        assert_eq!(
            coalescer.drain_due(settled + Duration::from_secs(1), |_| size(7)),
            ["a"]
        );
    }

    #[test]
    fn a_file_rewritten_in_place_is_caught_by_its_modification_time() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(TIMING);
        coalescer.record("a", written("/m/a.wav"), start);

        let stamp = |secs| {
            Probe::Ready(Fingerprint {
                len: 100,
                modified: Some(SystemTime::UNIX_EPOCH + Duration::from_secs(secs)),
            })
        };
        assert!(
            coalescer
                .drain_due(at(start, 2_000), |_| stamp(1))
                .is_empty()
        );
        assert!(
            coalescer
                .drain_due(at(start, 3_000), |_| stamp(2))
                .is_empty(),
            "same length, new bytes"
        );
        assert_eq!(coalescer.drain_due(at(start, 4_000), |_| stamp(2)), ["a"]);
    }

    #[test]
    fn a_busy_file_waits_and_a_vanished_one_does_not() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(TIMING);
        coalescer.record("a", written("/m/locked.mp3"), start);
        coalescer.record("b", written("/m/gone.mp3"), start);

        assert_eq!(
            coalescer.drain_due(at(start, 2_000), |path| {
                if path.ends_with("locked.mp3") {
                    Probe::Busy
                } else {
                    Probe::Gone
                }
            }),
            ["b"]
        );
        assert!(
            coalescer
                .drain_due(at(start, 30_000), |_| Probe::Busy)
                .is_empty()
        );
    }

    #[test]
    fn a_file_that_never_settles_stops_holding_its_folder() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(TIMING);
        coalescer.record("a", written("/m/recording.wav"), start);

        assert!(
            coalescer
                .drain_due(at(start, 59_999), |_| Probe::Busy)
                .is_empty()
        );
        assert_eq!(
            coalescer.drain_due(at(start, 60_000), |_| Probe::Busy),
            ["a"]
        );
    }

    /// The gate's scenario: a write every 500 ms for an hour, next to a file
    /// that settled at once. Every write restarts the quiet window, so only the
    /// give-up bound can ever report the folder.
    #[test]
    fn a_continuous_writer_cannot_hold_its_folder_forever() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(TIMING);
        coalescer.record("a", written("/m/done.mp3"), start);

        let mut batches = Vec::new();
        for tick in 0..(60 * 60 * 2u64) {
            let now = at(start, tick * 500);
            coalescer.record("a", written("/m/recording.wav"), now);
            let due = coalescer.drain_due(now, |_| size(tick));
            if !due.is_empty() {
                batches.push(tick * 500);
            }
        }

        assert!(
            !batches.is_empty(),
            "a folder with a continuous writer must still be reported"
        );
        assert!(
            batches[0] <= 60_000,
            "the first batch arrives at the give-up bound, not later: {batches:?}"
        );
        assert!(
            batches.len() >= 50,
            "and keeps arriving about once per bound for the whole hour: {}",
            batches.len()
        );
    }

    #[test]
    fn a_new_write_restarts_the_file_and_the_folder() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(TIMING);
        coalescer.record("a", written("/m/a.mp3"), start);
        assert!(
            coalescer
                .drain_due(at(start, 2_000), |_| size(5))
                .is_empty()
        );

        // The file grows again after its first probe.
        coalescer.record("a", written("/m/a.mp3"), at(start, 2_500));
        assert!(
            coalescer
                .drain_due(at(start, 3_500), |_| size(9))
                .is_empty(),
            "the folder is inside a fresh quiet window"
        );
        assert!(
            coalescer
                .drain_due(at(start, 4_500), |_| size(9))
                .is_empty(),
            "the new size restarts the file's stability clock"
        );
        assert_eq!(coalescer.drain_due(at(start, 5_500), |_| size(9)), ["a"]);
    }

    #[test]
    fn a_forgotten_folder_is_never_reported() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(TIMING);
        coalescer.record_all(["a", "b"], start);
        coalescer.forget("a");

        assert_eq!(
            coalescer.drain_due(at(start, 5_000), |_| Probe::Gone),
            ["b"]
        );
    }
}
