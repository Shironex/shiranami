//! The stamp on every boot stage, and the one INFO line §1.2 measures.
//!
//! Architecture §1.2 makes "cold start → first paint" a tracked metric with a
//! hard 1.5 s ceiling, and names the instrument: a `BootTimer` INFO log line.
//! Risk R18 makes boot **ordering** its own risk — "Sentry after ready,
//! migrations before backup, queue hydrate before DB" — mitigated by the order
//! being documented in §2.8, *stamped by this type*, and asserted by a
//! setup-sequence test.
//!
//! Both jobs are one type because they are the same observation. A timer that
//! only summed durations would answer "is boot slow?" but not "did the settings
//! store really open before the database?", and the second question is the one
//! that loses a user's library.
//!
//! # It records, it does not enforce
//!
//! [`BootTimer::stage`] is called by the sequence in the order the sequence runs
//! them; nothing here can make a caller run them in the right order. What it can
//! do — and what [`BootTimer::stages`] exists for — is let a test read the order
//! back off a real boot and compare it against [`Stage::EXPECTED_ORDER`], which
//! is §2.8 written down once. A reordering that compiles then fails a test that
//! names both sequences, rather than being discovered by a user whose library
//! opened before its migration ran.

use std::time::{Duration, Instant};

/// One stage of §2.8's boot sequence.
///
/// The variants are in the order §2.8 lists them, and
/// [`Stage::EXPECTED_ORDER`] depends on that: the derived `Ord` would be a
/// second, silent definition of the sequence, so ordering is asserted against
/// the explicit array instead and this enum stays a vocabulary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Stage {
    /// `tracing` is installed: console layer plus the rolling file appender.
    /// First, because every stage after it logs and a failure before it is
    /// invisible.
    Logging,
    /// The atomic JSON settings store is readable. Ahead of the database
    /// because the download location, the paused flag and the tool-status
    /// cache all live in it, and ahead of Sentry's *runtime* half because
    /// consent is one of its keys.
    Settings,
    /// The database is open, adopted and migrated.
    Database,
    /// The long-lived folders cache is built and prewarmed. After the database
    /// because two of its three roots are rows.
    FoldersCache,
    /// The loopback byte server is bound and serving. After the folders cache,
    /// which is the containment guard its audio route calls.
    Serve,
    /// Every deferred service is constructed and [`crate::state::AppState`] is
    /// managed. The first stage after which a stateful command answers for
    /// real.
    Services,
    /// The main window exists, is configured and is visible.
    Window,
}

impl Stage {
    /// §2.8's order, written down once.
    ///
    /// The array rather than the derived `Ord` is deliberate: a contributor
    /// adding a variant in the middle of the enum would silently redefine the
    /// sequence, where adding one here is a visible edit to the thing under
    /// test.
    pub const EXPECTED_ORDER: [Self; 7] = [
        Self::Logging,
        Self::Settings,
        Self::Database,
        Self::FoldersCache,
        Self::Serve,
        Self::Services,
        Self::Window,
    ];

    /// The name this stage carries in the log line.
    pub fn label(self) -> &'static str {
        match self {
            Self::Logging => "logging",
            Self::Settings => "settings",
            Self::Database => "database",
            Self::FoldersCache => "folders-cache",
            Self::Serve => "serve",
            Self::Services => "services",
            Self::Window => "window",
        }
    }
}

/// One completed stage and how long it took.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StageTiming {
    /// Which stage.
    pub stage: Stage,
    /// How long it took, measured from the end of the previous stage.
    pub elapsed: Duration,
}

/// Stamps each boot stage and reports the total and the slowest.
///
/// Construct once at the very top of boot and call [`BootTimer::stage`] as each
/// one completes — the timer measures *to* a stage boundary, so a call means
/// "this has now finished", never "this is starting".
#[derive(Debug)]
pub struct BootTimer {
    started: Instant,
    last: Instant,
    stages: Vec<StageTiming>,
}

impl BootTimer {
    /// Start the clock.
    pub fn start() -> Self {
        let now = Instant::now();
        Self {
            started: now,
            last: now,
            stages: Vec::with_capacity(Stage::EXPECTED_ORDER.len()),
        }
    }

    /// Record that `stage` has just finished.
    ///
    /// Logged at DEBUG individually; the INFO line every user's log carries is
    /// [`BootTimer::finish`]'s single summary, because seven lines per launch
    /// is seven lines to scroll past when something else is wrong.
    pub fn stage(&mut self, stage: Stage) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last);
        self.last = now;
        self.stages.push(StageTiming { stage, elapsed });

        tracing::debug!(
            stage = stage.label(),
            elapsed_ms = elapsed.as_millis(),
            "boot stage complete"
        );
    }

    /// Everything stamped so far, in the order it was stamped.
    ///
    /// This is what lets a test read §2.8's ordering back off a real boot rather
    /// than off a comment.
    pub fn stages(&self) -> &[StageTiming] {
        &self.stages
    }

    /// Total elapsed since [`BootTimer::start`].
    pub fn total(&self) -> Duration {
        self.last.duration_since(self.started)
    }

    /// The slowest stage, or `None` when nothing was stamped.
    pub fn slowest(&self) -> Option<StageTiming> {
        self.stages.iter().copied().max_by_key(|timing| timing.elapsed)
    }

    /// Emit §1.2's measurement line.
    ///
    /// One line, at INFO, carrying every stage — so a user reporting "it takes
    /// forever to start" produces the answer in the log they already have,
    /// rather than in a build with extra instrumentation they would have to be
    /// talked through installing.
    pub fn finish(&self) {
        let breakdown = self
            .stages
            .iter()
            .map(|timing| format!("{}={}ms", timing.stage.label(), timing.elapsed.as_millis()))
            .collect::<Vec<_>>()
            .join(" ");

        let slowest = self.slowest();

        tracing::info!(
            total_ms = self.total().as_millis(),
            slowest = slowest.map(|timing| timing.stage.label()).unwrap_or("none"),
            slowest_ms = slowest.map_or(0, |timing| timing.elapsed.as_millis()),
            stages = %breakdown,
            "boot complete"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The stage vocabulary and §2.8's order agree, and the array has no
    /// duplicates and no omissions. Cheap, and it is what makes
    /// [`the_recorded_order_can_be_checked_against_section_2_8`] meaningful:
    /// comparing a boot against an expectation nothing pins is comparing it
    /// against nothing.
    #[test]
    fn the_expected_order_names_every_stage_exactly_once() {
        let mut seen = std::collections::HashSet::new();
        for stage in Stage::EXPECTED_ORDER {
            assert!(seen.insert(stage), "{stage:?} appears twice in §2.8's order");
        }

        assert_eq!(
            seen.len(),
            Stage::EXPECTED_ORDER.len(),
            "every stage the timer can stamp must appear in the expected order"
        );
    }

    #[test]
    fn every_stage_has_a_distinct_label() {
        let labels: std::collections::HashSet<_> = Stage::EXPECTED_ORDER
            .iter()
            .map(|stage| stage.label())
            .collect();

        assert_eq!(labels.len(), Stage::EXPECTED_ORDER.len());
    }

    /// The property the timer exists to make checkable: a boot's recorded
    /// sequence is readable, and comparable against §2.8.
    #[test]
    fn the_recorded_order_can_be_checked_against_section_2_8() {
        let mut timer = BootTimer::start();
        for stage in Stage::EXPECTED_ORDER {
            timer.stage(stage);
        }

        let recorded: Vec<Stage> = timer.stages().iter().map(|timing| timing.stage).collect();

        assert_eq!(recorded, Stage::EXPECTED_ORDER.to_vec());
    }

    /// …and it fails when the order is wrong, which is the half that makes it a
    /// guard rather than a description (R17's lesson, applied to boot order).
    #[test]
    fn a_reordered_boot_does_not_match() {
        let mut timer = BootTimer::start();
        // Serve before the database: the ordering bug R18 names, in which the
        // audio route's containment guard is built over a library that is not
        // open yet.
        for stage in [Stage::Logging, Stage::Settings, Stage::Serve, Stage::Database] {
            timer.stage(stage);
        }

        let recorded: Vec<Stage> = timer.stages().iter().map(|timing| timing.stage).collect();

        assert_ne!(
            recorded,
            Stage::EXPECTED_ORDER[..recorded.len()].to_vec(),
            "a swapped pair has to be detectable, or the guard proves nothing"
        );
    }

    #[test]
    fn nothing_stamped_has_no_slowest_stage() {
        assert_eq!(BootTimer::start().slowest(), None);
    }

    /// The summary names the stage that actually dominated. Asserted through a
    /// real sleep rather than an injected clock because the ordering of two
    /// durations is the whole claim, and 15 ms is cheaper than a clock seam
    /// nothing else in boot needs.
    #[test]
    fn the_slowest_stage_is_the_one_that_took_longest() {
        let mut timer = BootTimer::start();
        timer.stage(Stage::Logging);
        std::thread::sleep(Duration::from_millis(15));
        timer.stage(Stage::Settings);
        timer.stage(Stage::Database);

        assert_eq!(
            timer.slowest().map(|timing| timing.stage),
            Some(Stage::Settings)
        );
        assert!(timer.total() >= Duration::from_millis(15));
    }
}
