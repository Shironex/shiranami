//! The one publisher of now-playing state to the OS.
//!
//! Owns a [`MediaControlsBackend`], an [`UpdateGate`] and the memory of what it
//! last wrote. The shell calls [`MediaControlsService::update`] from the
//! `media_controls_update` command and [`MediaControlsService::flush_due`] from
//! a timer; everything else is internal.
//!
//! # Why metadata and playback are pushed separately
//!
//! The OS APIs split them, and the split is load-bearing rather than cosmetic.
//! On Windows `set_metadata` ends in `DisplayUpdater::Update()`, which is what
//! re-renders the SMTC flyout — calling it on every playhead tick would make the
//! popup flicker once a second for the whole track. So metadata is written only
//! when it actually changed, and a playhead-only update touches nothing but
//! `set_playback`. Metadata goes first, because souvlaki's Windows backend sets
//! the timeline's end and max-seek times inside `set_metadata` and its position
//! inside `set_playback`; the other order writes a position into a timeline
//! whose length is still the previous track's.

use std::time::Instant;

use crate::backend::{CommandSink, MediaControlsBackend};
use crate::coalesce::{GateOutcome, UpdateGate};
use crate::error::Result;
use crate::os::{OsMetadata, OsPlayback};
use crate::state::MediaState;

/// What a call to the service did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Applied {
    /// The OS surface was written to.
    Pushed,
    /// Held by the throttle. The shell should call
    /// [`MediaControlsService::flush_due`] at or after `due_at`.
    Deferred {
        /// When the held state becomes emittable.
        due_at: Instant,
    },
    /// The OS already showed this.
    Unchanged,
}

/// Publishes playback state to an OS media surface.
#[derive(Debug)]
pub struct MediaControlsService<B> {
    backend: B,
    gate: UpdateGate,
    /// The metadata currently on the OS surface, so a playhead-only update can
    /// skip the expensive half of the push.
    displayed: Option<OsMetadata>,
}

impl<B: MediaControlsBackend> MediaControlsService<B> {
    /// Wrap a backend.
    pub fn new(backend: B) -> Self {
        Self {
            backend,
            gate: UpdateGate::default(),
            displayed: None,
        }
    }

    /// Start delivering the OS's remote commands to `sink`.
    ///
    /// Resets the throttle: attaching means the OS surface is new, so nothing
    /// may be assumed about what it currently shows.
    pub fn attach(&mut self, sink: CommandSink) -> Result<()> {
        self.gate.reset();
        self.displayed = None;
        self.backend.attach(sink)
    }

    /// Publish a state, subject to the throttle.
    pub fn update(&mut self, now: Instant, state: MediaState) -> Result<Applied> {
        match self.gate.submit(now, state) {
            GateOutcome::Emit(state) => self.push_or_forget(&state),
            GateOutcome::Deferred { due_at } => Ok(Applied::Deferred { due_at }),
            GateOutcome::Unchanged => Ok(Applied::Unchanged),
        }
    }

    /// Publish whatever the throttle is holding, if its window has closed.
    pub fn flush_due(&mut self, now: Instant) -> Result<Applied> {
        match self.gate.flush_due(now) {
            Some(state) => self.push_or_forget(&state),
            None => Ok(Applied::Unchanged),
        }
    }

    /// When the throttle's held state becomes emittable, if it holds one.
    pub fn deferred_until(&self) -> Option<Instant> {
        self.gate.due_at_pending()
    }

    /// Tear the OS surface down.
    pub fn detach(&mut self) -> Result<()> {
        self.gate.reset();
        self.displayed = None;
        self.backend.detach()
    }

    /// The wrapped backend, for the shell's own platform-specific needs.
    pub fn backend(&self) -> &B {
        &self.backend
    }

    /// Push, and on failure forget that the state was ever accepted.
    ///
    /// The gate has already recorded the state as emitted by the time we get
    /// here. Leaving that record in place after a failed write would make the
    /// service believe the OS shows something it does not — and since the
    /// renderer re-sends the *same* state on the next tick, the gate would
    /// answer `Unchanged` and never retry. A transient SMTC failure would
    /// become a permanently blank flyout.
    fn push_or_forget(&mut self, state: &MediaState) -> Result<Applied> {
        match self.push(state) {
            Ok(()) => Ok(Applied::Pushed),
            Err(error) => {
                tracing::warn!(%error, "OS media surface rejected an update");
                self.gate.reset();
                Err(error)
            }
        }
    }

    fn push(&mut self, state: &MediaState) -> Result<()> {
        let metadata = OsMetadata::from_state(state);

        if self.displayed.as_ref() != Some(&metadata) {
            self.backend.set_metadata(&metadata)?;
            self.displayed = Some(metadata);
        }

        self.backend.set_playback(&OsPlayback::from_state(state))
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::command::MediaCommand;
    use crate::fake::{BackendCall, RecordingBackend, playing};

    fn service() -> MediaControlsService<RecordingBackend> {
        MediaControlsService::new(RecordingBackend::new())
    }

    fn loaded(current_time: f64) -> MediaState {
        MediaState::Loaded(playing(current_time))
    }

    fn at(base: Instant, millis: u64) -> Instant {
        base + Duration::from_millis(millis)
    }

    #[test]
    fn the_first_update_writes_both_halves_of_the_surface() {
        let base = Instant::now();
        let mut service = service();

        assert_eq!(
            service
                .update(base, loaded(0.0))
                .expect("the push succeeds"),
            Applied::Pushed
        );

        assert_eq!(
            service.backend().calls(),
            [
                BackendCall::Metadata(OsMetadata::from_state(&loaded(0.0))),
                BackendCall::Playback(OsPlayback::from_state(&loaded(0.0))),
            ]
        );
    }

    #[test]
    fn metadata_is_written_before_playback() {
        let base = Instant::now();
        let mut service = service();
        service
            .update(base, loaded(0.0))
            .expect("the push succeeds");

        let calls = service.backend().calls();
        let metadata_at = calls
            .iter()
            .position(|call| matches!(call, BackendCall::Metadata(_)));
        let playback_at = calls
            .iter()
            .position(|call| matches!(call, BackendCall::Playback(_)));

        assert!(
            metadata_at < playback_at,
            "the Windows timeline gets its length from set_metadata"
        );
    }

    /// The flicker guard: a second of playback must not repaint the SMTC
    /// flyout.
    #[test]
    fn a_playhead_only_update_does_not_rewrite_the_metadata() {
        let base = Instant::now();
        let mut service = service();
        service
            .update(base, loaded(0.0))
            .expect("the push succeeds");
        service
            .update(at(base, 1_000), loaded(1.0))
            .expect("the push succeeds");

        assert_eq!(
            service.backend().metadata_pushes().len(),
            1,
            "only the track change warrants a metadata write"
        );
        assert_eq!(service.backend().playback_pushes().len(), 2);
    }

    #[test]
    fn a_track_change_rewrites_the_metadata() {
        let base = Instant::now();
        let mut service = service();
        service
            .update(base, loaded(0.0))
            .expect("the push succeeds");

        let mut next = playing(0.0);
        next.title = "Another Song".to_owned();
        service
            .update(at(base, 100), MediaState::Loaded(next))
            .expect("the push succeeds");

        let pushes = service.backend().metadata_pushes();
        assert_eq!(pushes.len(), 2);
        assert_eq!(pushes[1].title, "Another Song");
    }

    #[test]
    fn a_held_update_touches_nothing_until_it_is_flushed() {
        let base = Instant::now();
        let mut service = service();
        service
            .update(base, loaded(0.0))
            .expect("the push succeeds");

        let before = service.backend().calls().len();
        let outcome = service
            .update(at(base, 250), loaded(0.25))
            .expect("the submit succeeds");

        assert_eq!(
            outcome,
            Applied::Deferred {
                due_at: at(base, 1_000)
            }
        );
        assert_eq!(service.backend().calls().len(), before);
        assert_eq!(service.deferred_until(), Some(at(base, 1_000)));

        assert_eq!(
            service
                .flush_due(at(base, 1_000))
                .expect("the flush succeeds"),
            Applied::Pushed
        );
        assert_eq!(
            service.backend().playback_pushes().last(),
            Some(&OsPlayback::from_state(&loaded(0.25)))
        );
    }

    #[test]
    fn flushing_early_or_with_nothing_held_writes_nothing() {
        let base = Instant::now();
        let mut service = service();
        service
            .update(base, loaded(0.0))
            .expect("the push succeeds");
        let before = service.backend().calls().len();

        assert_eq!(
            service
                .flush_due(at(base, 5_000))
                .expect("the flush is fine"),
            Applied::Unchanged
        );
        assert_eq!(service.backend().calls().len(), before);
    }

    #[test]
    fn resubmitting_the_displayed_state_writes_nothing() {
        let base = Instant::now();
        let mut service = service();
        service
            .update(base, loaded(4.0))
            .expect("the push succeeds");
        let before = service.backend().calls().len();

        assert_eq!(
            service
                .update(at(base, 3_000), loaded(4.0))
                .expect("the submit succeeds"),
            Applied::Unchanged
        );
        assert_eq!(service.backend().calls().len(), before);
    }

    #[test]
    fn clearing_blanks_the_metadata_and_stops_playback() {
        let base = Instant::now();
        let mut service = service();
        service
            .update(base, loaded(4.0))
            .expect("the push succeeds");
        service
            .update(at(base, 100), MediaState::Cleared)
            .expect("the push succeeds");

        assert_eq!(
            service.backend().metadata_pushes().last(),
            Some(&OsMetadata::default())
        );
        assert_eq!(
            service.backend().playback_pushes().last(),
            Some(&OsPlayback::Stopped)
        );
    }

    #[test]
    fn attaching_routes_the_os_commands_to_the_sink() {
        let (sink, mut receiver) = CommandSink::channel();
        let mut service = service();
        service.attach(sink).expect("attaching succeeds");

        service.backend().emit(MediaCommand::TogglePlay);
        service.backend().emit(MediaCommand::Next);

        assert_eq!(receiver.try_recv().ok(), Some(MediaCommand::TogglePlay));
        assert_eq!(receiver.try_recv().ok(), Some(MediaCommand::Next));
    }

    #[test]
    fn detaching_stops_the_commands() {
        let (sink, mut receiver) = CommandSink::channel();
        let mut service = service();
        service.attach(sink).expect("attaching succeeds");
        service.detach().expect("detaching succeeds");

        service.backend().emit(MediaCommand::Stop);
        assert!(receiver.try_recv().is_err());
    }

    /// Re-attaching rebuilds the OS surface, so the service must re-push
    /// everything rather than believe its own cache.
    #[test]
    fn reattaching_forgets_what_was_displayed() {
        let base = Instant::now();
        let (first, _first_receiver) = CommandSink::channel();
        let (second, _second_receiver) = CommandSink::channel();
        let mut service = service();

        service.attach(first).expect("attaching succeeds");
        service
            .update(base, loaded(4.0))
            .expect("the push succeeds");
        service.attach(second).expect("re-attaching succeeds");
        service
            .update(at(base, 10), loaded(4.0))
            .expect("the push succeeds");

        assert_eq!(
            service.backend().metadata_pushes().len(),
            2,
            "the new surface shows nothing until it is written to"
        );
    }

    /// A failed metadata write must not be remembered as displayed, or the
    /// retry after a transient SMTC failure would be skipped forever.
    #[test]
    fn a_failed_metadata_write_is_not_recorded_as_displayed() {
        let base = Instant::now();
        let mut service = service();
        service.backend().fail_next();

        assert!(service.update(base, loaded(0.0)).is_err());

        service
            .update(at(base, 100), loaded(0.0))
            .expect("the retry succeeds");
        assert_eq!(service.backend().metadata_pushes().len(), 1);
    }
}
