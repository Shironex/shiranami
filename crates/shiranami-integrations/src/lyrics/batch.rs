//! Running write-back over a set of tracks.
//!
//! Shaped after `shiranami_metadata::enrich::batch`, whose two survivability
//! properties this batch needs for the same reasons and keeps verbatim:
//!
//! - **One failure never aborts the run.** Every track settles into a counted
//!   outcome — including a refused write and an unreachable directory — because
//!   a library-wide pass must not die on track 400 of 2,000.
//! - **Cancellation is prompt and reports once.** A queued track whose turn
//!   arrives after the cancel does no work at all, and exactly one `cancelled`
//!   tick is emitted per run rather than one per abandoned track.
//!
//! # Concurrency, and why it is lower than enrichment's
//!
//! `lrclib.net` sits in [`shiranami_net::HOST_GATES`] at 250 ms, so the real
//! rate limit is the gate and not this number — [`SAVE_CONCURRENCY`] exists only
//! so one track's sidecar write overlaps the next track's gate wait. Two rather
//! than enrichment's four: the overlapped work here is a single small file
//! write, not a cover download plus a whole-file tag rewrite, so there is much
//! less to hide behind the gate and a wider fan-out would only queue up more
//! futures waiting on the same 250 ms.
//!
//! # The summary counts tracks, not writes
//!
//! Every input lands in exactly one bucket of [`LyricsBatchSummary`] and the
//! buckets sum to the number of tracks the run reached. A cancelled run
//! therefore reports a total *lower* than its input, which is what tells the
//! renderer the pass was partial without a separate flag.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use futures::StreamExt as _;
use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;
use tokio_util::sync::CancellationToken;

use crate::lyrics::service::{LyricsRequest, LyricsService, SaveOutcome};
use crate::lyrics::writeback::SidecarSkip;

/// How many tracks are in flight at once. See the module docs.
pub const SAVE_CONCURRENCY: usize = 2;

/// One track offered up for write-back.
///
/// The same five facts `lyrics:fetch` takes, plus the row id so a caller can
/// match a tick to a track. `file_path` is required rather than optional: a
/// track with nowhere to write a file beside is not a candidate for this run,
/// and the caller filters those out before submitting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LyricsBatchTrack {
    /// Database id, echoed on every progress tick.
    pub id: String,
    /// The audio file the sidecar is written beside.
    pub file_path: String,
    /// Track title — the search term.
    pub title: String,
    /// Track artist.
    pub artist: String,
    /// Album, when known.
    #[specta(optional)]
    pub album: Option<String>,
    /// Track length in seconds, as a matching hint.
    #[specta(optional, type = Option<Number>)]
    pub duration_seconds: Option<f64>,
}

/// What happened to one track, as the progress tick reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum LyricsBatchStatus {
    /// The lookup is under way.
    Searching,
    /// A `.lrc` was written.
    Saved,
    /// Nothing to do: already answered, not allowed, not synced, or off.
    Skipped,
    /// The directory has no lyrics for this track.
    NotFound,
    /// The lookup or the write failed.
    Failed,
    /// The run was cancelled. Emitted exactly once.
    Cancelled,
}

/// One progress tick.
///
/// `current` is a settled count, so it is monotonic per the counter even though
/// delivery order between two racing ticks is not guaranteed — a consumer takes
/// the max, as `analysis:progress` documents for the same reason.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LyricsBatchProgress {
    /// Tracks settled so far.
    #[specta(type = Number)]
    pub current: usize,
    /// Tracks submitted.
    #[specta(type = Number)]
    pub total: usize,
    /// The track this tick is about.
    pub track_name: String,
    /// What happened to it.
    pub status: LyricsBatchStatus,
}

/// What a finished — or cancelled — run counted.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LyricsBatchSummary {
    /// Tracks that gained a `.lrc`.
    #[specta(type = Number)]
    pub saved: usize,
    /// Tracks that already had one, or that the run may not write beside.
    #[specta(type = Number)]
    pub skipped: usize,
    /// Tracks the directory does not have.
    #[specta(type = Number)]
    pub not_found: usize,
    /// Tracks whose lookup or write failed. Worth another run.
    #[specta(type = Number)]
    pub failed: usize,
    /// Whether the run was cut short.
    pub cancelled: bool,
}

impl LyricsBatchSummary {
    /// Fold one track's outcome in.
    fn count(&mut self, outcome: &SaveOutcome) {
        match outcome {
            SaveOutcome::Saved(_) => self.saved += 1,
            SaveOutcome::Skipped(_) => self.skipped += 1,
            SaveOutcome::NotFound => self.not_found += 1,
            SaveOutcome::LookupFailed | SaveOutcome::WriteFailed => self.failed += 1,
        }
    }
}

/// Progress sink. Called from several tasks, so it must be `Sync`.
pub type ProgressFn<'a> = &'a (dyn Fn(LyricsBatchProgress) + Send + Sync);

/// Fetch and save lyrics for every track, [`SAVE_CONCURRENCY`] at a time.
///
/// Never fails: every track contributes to the summary, and a run that could not
/// write a single file answers with `failed == total` rather than an error. The
/// caller's next move — tell the user what the run managed — is the same either
/// way, and an error would throw away the counts that make it worth telling.
pub async fn save_lyrics_for_tracks(
    service: &LyricsService,
    tracks: &[LyricsBatchTrack],
    cancel: &CancellationToken,
    progress: ProgressFn<'_>,
) -> LyricsBatchSummary {
    let state = RunState::new(tracks.len());

    // Owned inputs and a named `async fn`, not `iter()` and an `async move`
    // block — `enrich::batch::settle` documents the "implementation of `FnOnce`
    // is not general enough" trap that shape walks into at the command layer.
    futures::stream::iter(tracks.to_vec())
        .map(|track| settle(service, track, cancel, progress, &state))
        .buffered(SAVE_CONCURRENCY)
        .collect::<Vec<()>>()
        .await;

    state.into_summary()
}

/// Settle one track: skip it if the run is cancelled, save it otherwise.
async fn settle(
    service: &LyricsService,
    track: LyricsBatchTrack,
    cancel: &CancellationToken,
    progress: ProgressFn<'_>,
    state: &RunState,
) {
    if cancel.is_cancelled() {
        state.report_cancelled_once(progress, &track.title);
        return;
    }

    state.report(progress, &track.title, LyricsBatchStatus::Searching);

    // Bound rather than inlined into the `select!`: a temporary built inside the
    // arm is dropped at the end of the statement while the future still borrows
    // it (E0716).
    let request = request_for(&track);

    let outcome = tokio::select! {
        biased;
        () = cancel.cancelled() => {
            state.report_cancelled_once(progress, &track.title);
            return;
        }
        outcome = service.save_lyrics(&request) => outcome,
    };

    let (settled, status) = state.complete(&outcome);
    progress(LyricsBatchProgress {
        current: settled,
        total: state.total,
        track_name: track.title,
        status,
    });
}

/// Project a batch row onto the request the service takes.
fn request_for(track: &LyricsBatchTrack) -> LyricsRequest {
    LyricsRequest {
        title: track.title.clone(),
        artist: track.artist.clone(),
        album: track.album.clone(),
        duration_seconds: track.duration_seconds,
        file_path: Some(std::path::PathBuf::from(&track.file_path)),
    }
}

/// Counters shared by every task in a run.
struct RunState {
    total: usize,
    summary: Mutex<LyricsBatchSummary>,
    completed: Mutex<usize>,
    /// The `cancelled` tick is emitted once per run, not once per abandoned
    /// track — `enrich::batch`'s `let cancelled = false` guard.
    cancel_reported: AtomicBool,
}

impl RunState {
    fn new(total: usize) -> Self {
        Self {
            total,
            summary: Mutex::new(LyricsBatchSummary::default()),
            completed: Mutex::new(0),
            cancel_reported: AtomicBool::new(false),
        }
    }

    /// Count `outcome`, returning the settled count and the tick's status.
    fn complete(&self, outcome: &SaveOutcome) -> (usize, LyricsBatchStatus) {
        let mut summary = lock(&self.summary);
        summary.count(outcome);
        drop(summary);

        let mut completed = lock(&self.completed);
        *completed += 1;
        (*completed, status_of(outcome))
    }

    /// The in-flight `current`: `min(completed + 1, total)`.
    fn in_flight(&self) -> usize {
        (*lock(&self.completed) + 1).min(self.total)
    }

    fn report(&self, progress: ProgressFn<'_>, track_name: &str, status: LyricsBatchStatus) {
        progress(LyricsBatchProgress {
            current: self.in_flight(),
            total: self.total,
            track_name: track_name.to_owned(),
            status,
        });
    }

    fn report_cancelled_once(&self, progress: ProgressFn<'_>, track_name: &str) {
        lock(&self.summary).cancelled = true;

        if self.cancel_reported.swap(true, Ordering::SeqCst) {
            return;
        }

        self.report(progress, track_name, LyricsBatchStatus::Cancelled);
    }

    fn into_summary(self) -> LyricsBatchSummary {
        *lock(&self.summary)
    }
}

/// The tick status one outcome reports as.
fn status_of(outcome: &SaveOutcome) -> LyricsBatchStatus {
    match outcome {
        SaveOutcome::Saved(_) => LyricsBatchStatus::Saved,
        SaveOutcome::Skipped(_) => LyricsBatchStatus::Skipped,
        SaveOutcome::NotFound => LyricsBatchStatus::NotFound,
        SaveOutcome::LookupFailed | SaveOutcome::WriteFailed => LyricsBatchStatus::Failed,
    }
}

/// `lock_or_recover` for this module's mutexes: they guard plain counters with
/// no invariant a panic could have broken, so recovering beats turning one
/// crash into two.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// Every skip reason, so a caller can explain one. Not used by the batch itself
/// — it counts them together — but a single skipped track reaching a caller
/// through [`SaveOutcome`] is worth a specific message.
pub const fn skip_reason(skip: SidecarSkip) -> &'static str {
    match skip {
        SidecarSkip::Disabled => "saving fetched lyrics is turned off",
        SidecarSkip::NoDestination => "the track has no file to write beside",
        SidecarSkip::NotAllowed => "the track is not inside a library folder",
        SidecarSkip::AlreadyExists => "a lyric file is already there",
        SidecarSkip::NotSynced => "the directory has no timed lyrics for it",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(id: &str) -> LyricsBatchTrack {
        LyricsBatchTrack {
            id: id.to_owned(),
            file_path: format!("/music/{id}.mp3"),
            title: format!("Track {id}"),
            artist: "Artist".to_owned(),
            album: None,
            duration_seconds: None,
        }
    }

    #[test]
    fn the_summary_buckets_every_outcome_exactly_once() {
        let mut summary = LyricsBatchSummary::default();
        for outcome in [
            SaveOutcome::Saved("/music/a.lrc".into()),
            SaveOutcome::Skipped(SidecarSkip::AlreadyExists),
            SaveOutcome::Skipped(SidecarSkip::Disabled),
            SaveOutcome::NotFound,
            SaveOutcome::LookupFailed,
            SaveOutcome::WriteFailed,
        ] {
            summary.count(&outcome);
        }

        assert_eq!(summary.saved, 1);
        assert_eq!(summary.skipped, 2);
        assert_eq!(summary.not_found, 1);
        assert_eq!(
            summary.failed, 2,
            "an unreachable directory and a refused write are both worth retrying"
        );
    }

    /// The distinction the summary exists to keep: a track the directory does
    /// not have is settled, and one it could not answer for is not.
    #[test]
    fn a_miss_and_a_failure_land_in_different_buckets() {
        let mut summary = LyricsBatchSummary::default();
        summary.count(&SaveOutcome::NotFound);
        summary.count(&SaveOutcome::LookupFailed);

        assert_eq!(summary.not_found, 1);
        assert_eq!(summary.failed, 1);
    }

    #[test]
    fn the_request_carries_every_matching_hint_through() {
        let mut input = track("a");
        input.album = Some("Album".to_owned());
        input.duration_seconds = Some(204.5);

        let request = request_for(&input);

        assert_eq!(request.title, "Track a");
        assert_eq!(request.artist, "Artist");
        assert_eq!(request.album.as_deref(), Some("Album"));
        assert_eq!(request.duration_seconds, Some(204.5));
        assert_eq!(
            request.file_path.as_deref(),
            Some(std::path::Path::new("/music/a.mp3"))
        );
    }

    /// One tick per run, however many tracks were abandoned — the counter the
    /// renderer's progress bar would otherwise see thrash.
    #[test]
    fn the_cancelled_tick_is_emitted_once_per_run() {
        let state = RunState::new(3);
        let ticks = Mutex::new(Vec::new());
        let sink = |progress: LyricsBatchProgress| lock(&ticks).push(progress.status);

        for _ in 0..3 {
            state.report_cancelled_once(&sink, "Track");
        }

        assert_eq!(lock(&ticks).as_slice(), &[LyricsBatchStatus::Cancelled]);
        assert!(state.into_summary().cancelled);
    }

    #[tokio::test]
    async fn a_run_cancelled_before_it_starts_touches_nothing() {
        let cancel = CancellationToken::new();
        cancel.cancel();

        let ticks = Mutex::new(Vec::new());
        let sink = |progress: LyricsBatchProgress| lock(&ticks).push(progress.status);
        let service = crate::lyrics::service::tests::offline_service();

        let summary =
            save_lyrics_for_tracks(&service, &[track("a"), track("b")], &cancel, &sink).await;

        assert_eq!(
            summary,
            LyricsBatchSummary {
                cancelled: true,
                ..Default::default()
            }
        );
        assert_eq!(
            lock(&ticks).as_slice(),
            &[LyricsBatchStatus::Cancelled],
            "no track did any work, and the cancel reported once"
        );
    }

    /// An empty run is a no-op with an all-zero summary, not a division by zero
    /// in the progress arithmetic.
    #[tokio::test]
    async fn an_empty_run_settles_immediately() {
        let service = crate::lyrics::service::tests::offline_service();
        let summary = save_lyrics_for_tracks(&service, &[], &CancellationToken::new(), &|_| {
            unreachable!("nothing to report")
        })
        .await;

        assert_eq!(summary, LyricsBatchSummary::default());
    }

    /// The default policy refuses to write, so a run under one is all-skipped
    /// and spends no request — the opt-in guard, asserted from the batch's side.
    #[tokio::test]
    async fn a_run_under_the_default_policy_writes_nothing() {
        let service = crate::lyrics::service::tests::offline_service();

        let summary = save_lyrics_for_tracks(
            &service,
            &[track("a"), track("b")],
            &CancellationToken::new(),
            &|_| {},
        )
        .await;

        assert_eq!(
            summary,
            LyricsBatchSummary {
                skipped: 2,
                ..Default::default()
            },
            "a policy that never opted in must not reach the network at all"
        );
    }
}
