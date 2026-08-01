//! `loudness:*` — the EBU R128 analysis batch, and its cancel.
//!
//! Two channels, ported from `apps/desktop/src/main/ipc/loudness.ts`. The
//! measurement is `shiranami_audio::measure_integrated_loudness`; the loop, the
//! skip test, the counters, the progress ticks and the persistence are the
//! handler's, and so are here.
//!
//! # The one namespace in this lane that writes rows
//!
//! `library` and `storage` deliberately hold no connection. This one does: the
//! measured LUFS lands in `tracks.loudness_lufs`, which is the **only** input to
//! volume levelling — the renderer computes `clamp(target - measured, ±12 dB)`
//! and multiplies the deck's gain node by it. A run that measured without
//! persisting would re-measure the whole library on every launch.
//!
//! The connection is therefore taken **twice per track and held across
//! neither** decode: once to read the skip test, once to write the result. That
//! is a deliberate departure from v1's shape, which held one `better-sqlite3`
//! handle for the whole run — it had no pool to starve. Here the pool holds a
//! single connection, and keeping it across a multi-minute decode of a
//! two-thousand-track library would stall every query in the app for the
//! duration. Acquire late, release early.
//!
//! # Cancellation is not a failure
//!
//! A cancelled run returns its **partial counts** rather than rejecting, and
//! emits one `cancelled` tick. The renderer shows "analysed 340 of 2,000" and
//! moves on, which is the right answer for something the user asked to stop.
//!
//! # A second run is refused, unlike a second scan
//!
//! v1 rejects with `loudness.busy` if the slot is taken, and the renderer also
//! disables the trigger. That code is declared here rather than in
//! `shiranami-core`'s frozen registry for the same reason `metadata.enrich_busy`
//! lives in `shiranami-metadata`: v1 declared it in the handler file, not in a
//! shared contract, so the command layer is its home.

use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use shiranami_audio::{AudioError, IntegratedLoudness, measure_integrated_loudness};
use shiranami_core::error::ErrorPayload;
use shiranami_db::repo::tracks;
use specta::Type;
// `usize` is a BigInt-style type specta refuses to emit, because a `u64` cannot
// round-trip through a JavaScript number. These counters are bounded by the
// library size, so `Number` is the honest projection — the same treatment
// `shiranami_library::VolumeUsage` gives its byte fields.
use specta_typescript::Number;
use tauri::{AppHandle, State};
use tauri_specta::Event as _;
use tokio_util::sync::CancellationToken;

use crate::commands::library::off_thread;
use crate::error::{CommandResult, WireResultExt as _};
use crate::events::LoudnessProgress as LoudnessProgressEvent;
use crate::state::AppState;
use crate::wire::Json;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::loudness::loudness_analyze,
                crate::commands::loudness::loudness_cancel,
            ]
        }
    };
}
pub(crate) use commands;

/// The renderer-visible code for "an analysis run is already in progress".
///
/// Ported verbatim from `LOUDNESS_BUSY_ERROR_CODE` in
/// `apps/desktop/src/main/ipc/loudness.ts`, and pinned against that file by
/// [`the_busy_code_still_matches_the_typescript_literal`] — a code the renderer
/// matches on is contract, and a silent rename shows up as the wrong toast.
///
/// [`the_busy_code_still_matches_the_typescript_literal`]: tests::the_busy_code_still_matches_the_typescript_literal
pub const LOUDNESS_BUSY_CODE: &str = "loudness.busy";

// ── wire types ───────────────────────────────────────────────────────────────

/// One track offered up for analysis. v1's `LoudnessAnalyzeInput`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoudnessAnalyzeInput {
    /// The row to measure and update.
    pub id: String,
    /// The file to decode.
    pub file_path: PathBuf,
    /// Display title, echoed on every progress tick.
    pub title: String,
}

/// What a finished — or cancelled — run counted.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoudnessAnalyzeResult {
    /// Tracks newly measured and persisted.
    #[specta(type = Number)]
    pub analyzed: usize,
    /// Tracks skipped: already measured, digitally silent, or no longer on disk.
    #[specta(type = Number)]
    pub skipped: usize,
    /// Tracks that failed to decode.
    #[specta(type = Number)]
    pub failed: usize,
}

/// Where a track got to. v1's `LoudnessProgress['status']`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum LoudnessStatus {
    /// The decode is running.
    Analyzing,
    /// Measured and persisted.
    Done,
    /// Nothing to do: already measured, silent, or missing.
    Skipped,
    /// The decode failed.
    Error,
    /// The run was cancelled. Emitted once, not once per abandoned track.
    Cancelled,
}

/// One progress tick.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoudnessProgress {
    /// How far along the run is.
    ///
    /// `index + 1` for every settled status and **`index`** for the two
    /// cancellation ticks. Reproduced from v1 rather than tidied: the renderer's
    /// bar is driven by this and the off-by-one on cancel is what stops it
    /// jumping a step for a track that was never measured.
    #[specta(type = Number)]
    pub current: usize,
    /// How many tracks the run covers.
    #[specta(type = Number)]
    pub total: usize,
    /// The track's title, for display.
    pub track_name: String,
    /// What happened.
    pub status: LoudnessStatus,
}

// ── the run slot ─────────────────────────────────────────────────────────────

/// The one in-flight analysis run, as managed state.
///
/// Claim-or-refuse, unlike [`crate::commands::library::ScanSlot`], because v1
/// checks the slot before starting and rejects. Phase 16 `manage`s this;
/// until then these commands answer "state not managed".
#[derive(Debug, Default)]
pub struct LoudnessRuns {
    // A plain `std::sync::Mutex`: it guards a small `Option` and is never held
    // across an await.
    active: Mutex<Option<Run>>,
    generations: AtomicU64,
}

/// The run currently holding the slot.
#[derive(Debug)]
struct Run {
    token: CancellationToken,
    /// Monotonic run number, so a guard can tell whether the slot is still its
    /// run's before clearing it.
    generation: u64,
}

impl LoudnessRuns {
    /// Take the slot, or fail with [`LOUDNESS_BUSY_CODE`].
    fn claim(&self) -> CommandResult<RunGuard<'_>> {
        let mut active = lock(&self.active);

        if active.is_some() {
            return Err(ErrorPayload {
                code: LOUDNESS_BUSY_CODE.to_owned(),
                message: "A loudness analysis run is already in progress.".to_owned(),
                details: None,
            });
        }

        let token = CancellationToken::new();
        let generation = self.generations.fetch_add(1, Ordering::SeqCst);
        *active = Some(Run {
            token: token.clone(),
            generation,
        });

        Ok(RunGuard {
            runs: self,
            token,
            generation,
        })
    }

    /// Cancel the active run. Silently a no-op when idle, as v1's was — its
    /// handler has no else-branch at all.
    fn cancel(&self) {
        if let Some(run) = lock(&self.active).as_ref() {
            tracing::info!("loudness cancellation requested");
            run.token.cancel();
        }
    }
}

/// Proof that the caller holds the run slot; releases it on drop.
#[derive(Debug)]
struct RunGuard<'runs> {
    runs: &'runs LoudnessRuns,
    token: CancellationToken,
    generation: u64,
}

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        let mut active = lock(&self.runs.active);

        // v1's `if (activeAbort === abort)`. A run finishing after a newer one
        // started must not clear the newer one's slot.
        if active
            .as_ref()
            .is_some_and(|current| current.generation == self.generation)
        {
            *active = None;
        }
    }
}

/// `lock_or_recover` for this module's one mutex.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

// ── the commands ─────────────────────────────────────────────────────────────

/// `loudness:cancel` — stop the active run.
///
/// Best-effort: the run notices at its next checkpoint and returns its partial
/// counts. A no-op when nothing is running.
#[tauri::command]
#[specta::specta]
pub async fn loudness_cancel(runs: State<'_, LoudnessRuns>) -> CommandResult<()> {
    runs.cancel();
    Ok(())
}

/// `loudness:analyze` — measure and persist integrated loudness for a batch.
///
/// Sequential, one track at a time, as v1 was: the decode is already
/// CPU-saturating and the unit of parallelism this crate's docs name is a track.
/// Already-measured tracks are skipped by re-reading the row, which keeps the
/// run idempotent even when the renderer passes a stale "needs analysis" set.
#[tauri::command]
#[specta::specta]
pub async fn loudness_analyze(
    app: AppHandle,
    state: State<'_, AppState>,
    runs: State<'_, LoudnessRuns>,
    input: Vec<LoudnessAnalyzeInput>,
) -> CommandResult<LoudnessAnalyzeResult> {
    let guard = runs.claim()?;
    let cancel = guard.token.clone();
    let total = input.len();
    let mut counts = LoudnessAnalyzeResult::default();

    for (index, track) in input.iter().enumerate() {
        if cancel.is_cancelled() {
            emit(&app, cancelled_at(index, total, &track.title));
            break;
        }

        // The skip test. Acquired and released before the decode below, never
        // held across it.
        let measured = {
            let mut conn = state.conn().await?;
            tracks::loudness_lufs(&mut conn, &track.id).await.wire()?
        };
        if measured.is_some() {
            counts.skipped += 1;
            emit(&app, tick(index + 1, total, track, LoudnessStatus::Skipped));
            continue;
        }

        emit(&app, tick(index + 1, total, track, LoudnessStatus::Analyzing));

        let file_path = track.file_path.clone();
        let outcome = off_thread("measure the track's loudness", move || {
            Ok(measure_integrated_loudness(&file_path))
        })
        .await?;

        // v1 re-checks after the measurement: cancellation resolved
        // `measureLoudness` to null, and reporting that as `skipped` would
        // credit the user with a decision the run made for them.
        if cancel.is_cancelled() {
            emit(&app, cancelled_at(index, total, &track.title));
            break;
        }

        match outcome {
            Ok(IntegratedLoudness::Measured(lufs)) => {
                let mut conn = state.conn().await?;
                tracks::set_loudness_lufs(&mut conn, &track.id, lufs)
                    .await
                    .wire()?;
                drop(conn);

                counts.analyzed += 1;
                emit(&app, tick(index + 1, total, track, LoudnessStatus::Done));
            }
            // Digital silence reads as −∞ LUFS: a real measurement of nothing.
            // There is nothing to level, so no value is stored — v1 skipped it
            // for the same reason, and did not hand it to ffmpeg either.
            Ok(IntegratedLoudness::Silent) => {
                counts.skipped += 1;
                emit(&app, tick(index + 1, total, track, LoudnessStatus::Skipped));
            }
            // A file that is simply gone is v1's `null`, which counted as a
            // skip. It is not a decode failure and calling it one would report
            // an unplugged drive as a library full of broken files.
            Err(error) if is_missing(&error) => {
                counts.skipped += 1;
                emit(&app, tick(index + 1, total, track, LoudnessStatus::Skipped));
            }
            Err(error) => {
                tracing::error!(%error, track = %track.title, "loudness analysis failed");
                counts.failed += 1;
                emit(&app, tick(index + 1, total, track, LoudnessStatus::Error));
            }
        }
    }

    tracing::info!(
        analyzed = counts.analyzed,
        skipped = counts.skipped,
        failed = counts.failed,
        total,
        "loudness analysis complete"
    );

    Ok(counts)
}

/// Whether this failure is "the file is not there" rather than "it will not
/// decode".
///
/// v1 could not tell the two apart — `measureLoudness` returned `null` for both
/// — and lumped them into `skipped`. The crate reports them separately, so the
/// split is made here: a missing file stays a skip, and everything else becomes
/// the `failed` count v1 also had for a thrown measurement.
fn is_missing(error: &AudioError) -> bool {
    matches!(
        error,
        AudioError::Io { source, .. } if source.kind() == std::io::ErrorKind::NotFound
    )
}

/// A settled tick for one track.
fn tick(
    current: usize,
    total: usize,
    track: &LoudnessAnalyzeInput,
    status: LoudnessStatus,
) -> LoudnessProgress {
    LoudnessProgress {
        current,
        total,
        track_name: track.title.clone(),
        status,
    }
}

/// The cancellation tick, whose `current` is the index rather than `index + 1`.
fn cancelled_at(index: usize, total: usize, track_name: &str) -> LoudnessProgress {
    LoudnessProgress {
        current: index,
        total,
        track_name: track_name.to_owned(),
        status: LoudnessStatus::Cancelled,
    }
}

/// Emit `loudness:progress`.
///
/// A failed emit is dropped: v1's `sendToRenderer` returns `false` for a
/// destroyed window and the run carries on. The payload is serialized into
/// [`Json`] because `crate::events` declares this channel that way, and the
/// bytes are identical to what `webContents.send` produced.
fn emit(app: &AppHandle, progress: LoudnessProgress) {
    let Ok(payload) = serde_json::to_value(&progress) else {
        tracing::warn!("a loudness progress tick could not be serialized");
        return;
    };

    let _ = LoudnessProgressEvent(Json(payload)).emit(app);
}

#[cfg(test)]
#[path = "tests/loudness.rs"]
mod tests;
