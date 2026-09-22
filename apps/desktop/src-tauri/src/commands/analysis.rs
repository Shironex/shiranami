//! `analysis:*` — the one-pass, all-cores library analysis batch.
//!
//! The v2 feature wave's F1: one button that walks the library and, per track,
//! decodes **exactly once** while `shiranami_audio`'s fan-out sink feeds every
//! analyser at the same time — waveform peaks, integrated loudness, tempo and
//! key — with a private rayon pool running one track per core. No v1 channel is
//! ported here; `loudness:analyze` remains exactly the sequential
//! loudness-only batch v1 shipped, and this namespace is the engine that
//! supersedes it without touching its contract.
//!
//! # What one track costs, and what it skips
//!
//! Per track the run asks only for what is missing: peaks are skipped on a
//! `waveform-peaks/` cache hit (the same key construction `waveform:get-peaks`
//! uses, byte for byte — see [`crate::commands::waveform`] for why the *path
//! string* feeds the hash), loudness is skipped when `tracks.loudness_lufs` is
//! set (v1 values are never re-measured), and tempo/key are skipped when both
//! columns hold values. A track needing nothing is a skip without a decode,
//! which keeps re-runs cheap and the whole command idempotent.
//!
//! # Parallel analysis, serialized writes
//!
//! The pool holds a single connection, so the decode fan-out must not fan into
//! the database. Workers post results to a channel; one async consumer drains
//! it in chunks of [`WRITE_CHUNK`] and pays one acquire + one transaction per
//! chunk ([`tracks::record_analysis_many`]), releasing between chunks so the
//! rest of the app keeps querying while the batch runs. Peaks bypass the
//! database entirely — they go to the disk cache from inside the worker.
//!
//! # Progress is settled-count, not index
//!
//! `loudness:progress` ticks `index + 1` because its loop is sequential. A
//! parallel run has no meaningful index, so `analysis:progress` carries the
//! count of *settled* tracks — monotonic per the counter, though delivery
//! order between two racing ticks is not guaranteed; a consumer takes the max.
//! Cancellation still emits exactly one `cancelled` tick and the command still
//! resolves with its partial counts, per the loudness precedent.
//!
//! # A second run is refused
//!
//! Same claim-or-refuse slot as `loudness:analyze`, same reasoning, own code:
//! [`ANALYSIS_BUSY_CODE`] is declared here because the namespace is born in
//! v2 and no frozen registry entry describes it. The slot machinery mirrors
//! [`crate::commands::loudness::LoudnessRuns`] deliberately rather than
//! sharing it — each namespace owns its run state, as the port left them.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use shiranami_audio::peaks::cache;
use shiranami_audio::{
    AnalyzeRequest, AudioError, IntegratedLoudness, WAVEFORM_PEAK_COUNT, analyze_file,
};
use shiranami_core::error::ErrorPayload;
use shiranami_db::repo::tracks::{self, AnalysisWrite, TrackAnalysisState};
use specta::Type;
use specta_typescript::Number;
use tauri::{AppHandle, State};
use tauri_specta::Event as _;
use tokio_util::sync::CancellationToken;

use crate::error::{CommandResult, WireResultExt as _};
use crate::events::AnalysisProgress as AnalysisProgressEvent;
use crate::state::AppState;
use crate::wire::{Json, data_dir, off_thread};

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::analysis::analysis_analyze,
                crate::commands::analysis::analysis_cancel,
            ]
        }
    };
}
pub(crate) use commands;

/// The renderer-visible code for "an analysis run is already in progress".
///
/// Born in v2 — there is no v1 literal to pin against, so the declaration here
/// *is* the contract, and [`the_busy_code_is_the_contract`] freezes it.
///
/// [`the_busy_code_is_the_contract`]: tests::the_busy_code_is_the_contract
pub const ANALYSIS_BUSY_CODE: &str = "analysis.busy";

/// Results per write transaction. See the module docs: the batch accumulates
/// while decodes continue, then pays one acquire and one commit per chunk.
const WRITE_CHUNK: usize = 64;

// ── wire types ───────────────────────────────────────────────────────────────

/// One track offered up for analysis.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisInput {
    /// The row to measure and update.
    pub id: String,
    /// The file to decode. A `String` and not a `PathBuf` for the same reason
    /// `waveform:get-peaks` takes one: the peaks-cache key hashes this exact
    /// string, and a `PathBuf` round trip is a silent rewrite the key cannot
    /// survive.
    pub file_path: String,
    /// Display title, echoed on every progress tick.
    pub title: String,
}

/// What a finished — or cancelled — run counted.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisBatchResult {
    /// Tracks decoded and measured this run.
    #[specta(type = Number)]
    pub analyzed: usize,
    /// Tracks needing nothing, or no longer on disk.
    #[specta(type = Number)]
    pub skipped: usize,
    /// Tracks that failed to decode.
    #[specta(type = Number)]
    pub failed: usize,
}

impl AnalysisBatchResult {
    /// Combine two partial counts — the rayon reduction.
    fn merge(self, other: Self) -> Self {
        Self {
            analyzed: self.analyzed + other.analyzed,
            skipped: self.skipped + other.skipped,
            failed: self.failed + other.failed,
        }
    }
}

/// Where a track got to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisStatus {
    /// Decoded and measured.
    Done,
    /// Nothing to do: fully analysed already, or missing from disk.
    Skipped,
    /// The decode failed.
    Error,
    /// The run was cancelled. Emitted once, not once per abandoned track.
    Cancelled,
}

/// One progress tick.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisProgress {
    /// Settled tracks so far (see the module docs — not an index).
    #[specta(type = Number)]
    pub current: usize,
    /// How many tracks the run covers.
    #[specta(type = Number)]
    pub total: usize,
    /// The settled track's title; empty on the final `cancelled` tick, which
    /// describes the run rather than a track.
    pub track_name: String,
    /// What happened.
    pub status: AnalysisStatus,
}

// ── the run slot ─────────────────────────────────────────────────────────────

/// The one in-flight analysis run, as managed state.
///
/// Claim-or-refuse, mirroring [`crate::commands::loudness::LoudnessRuns`]
/// field for field — see that module for why the mutex is `std::sync` and what
/// the generation number closes.
#[derive(Debug, Default)]
pub struct AnalysisRuns {
    active: Mutex<Option<Run>>,
    generations: AtomicU64,
}

/// The run currently holding the slot.
#[derive(Debug)]
struct Run {
    token: CancellationToken,
    generation: u64,
}

impl AnalysisRuns {
    /// Take the slot, or fail with [`ANALYSIS_BUSY_CODE`].
    fn claim(&self) -> CommandResult<RunGuard<'_>> {
        let mut active = lock(&self.active);

        if active.is_some() {
            return Err(ErrorPayload {
                code: ANALYSIS_BUSY_CODE.to_owned(),
                message: "An analysis run is already in progress.".to_owned(),
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

    /// Cancel the active run. Silently a no-op when idle.
    fn cancel(&self) {
        if let Some(run) = lock(&self.active).as_ref() {
            tracing::info!("analysis cancellation requested");
            run.token.cancel();
        }
    }
}

/// Proof that the caller holds the run slot; releases it on drop.
#[derive(Debug)]
struct RunGuard<'runs> {
    runs: &'runs AnalysisRuns,
    token: CancellationToken,
    generation: u64,
}

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        let mut active = lock(&self.runs.active);

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

/// `analysis:cancel` — stop the active run.
///
/// Best-effort: workers notice at their next checkpoint and the run resolves
/// with its partial counts. A no-op when nothing is running.
#[tauri::command]
#[specta::specta]
pub async fn analysis_cancel(runs: State<'_, AnalysisRuns>) -> CommandResult<()> {
    runs.cancel();
    Ok(())
}

/// `analysis:analyze` — one decode per track, every measurement, all cores.
#[tauri::command]
#[specta::specta]
pub async fn analysis_analyze(
    app: AppHandle,
    state: State<'_, AppState>,
    runs: State<'_, AnalysisRuns>,
    input: Vec<AnalysisInput>,
) -> CommandResult<AnalysisBatchResult> {
    let guard = runs.claim()?;
    let peaks_dir = data_dir(&app).map(|dir| dir.join(crate::commands::waveform::PEAKS_DIR));

    let emit_app = app.clone();
    run_batch(
        &state,
        peaks_dir,
        input,
        guard.token.clone(),
        move |progress| emit(&emit_app, progress),
    )
    .await
}

// ── the engine ───────────────────────────────────────────────────────────────

/// The whole batch, free of Tauri managed state so a test can drive it against
/// a real database and a callback.
async fn run_batch(
    state: &AppState,
    peaks_dir: Option<PathBuf>,
    input: Vec<AnalysisInput>,
    cancel: CancellationToken,
    emit: impl Fn(AnalysisProgress) + Send + Sync + 'static,
) -> CommandResult<AnalysisBatchResult> {
    let total = input.len();

    // The skip test for the whole batch, on one acquire: single-row primary-key
    // reads, released before any decode starts.
    let mut stored_states = Vec::with_capacity(total);
    {
        let mut conn = state.conn().await?;
        for track in &input {
            let stored = tracks::analysis_state(&mut conn, &track.id).await.wire()?;
            stored_states.push(stored.unwrap_or_default());
        }
    }

    let emit = Arc::new(emit);
    let settled = Arc::new(AtomicUsize::new(0));
    let (write_tx, mut write_rx) = tokio::sync::mpsc::unbounded_channel::<AnalysisWrite>();

    // The decode fan-out, off the webview's thread.
    let batch = {
        let cancel = cancel.clone();
        let emit = Arc::clone(&emit);
        let settled = Arc::clone(&settled);
        off_thread("analyse the library", move || {
            Ok(run_decodes(
                &input,
                &stored_states,
                peaks_dir.as_deref(),
                &cancel,
                &write_tx,
                emit.as_ref(),
                &settled,
                total,
            ))
        })
    };

    // The serialized writer. A write failure cancels the run — decodes already
    // in flight finish and are dropped — and the command rejects, exactly as a
    // failed `loudness:analyze` write rejected.
    let writer = async {
        let mut outcome: CommandResult<()> = Ok(());
        while let Some(first) = write_rx.recv().await {
            let mut chunk = Vec::with_capacity(WRITE_CHUNK);
            chunk.push(first);
            while chunk.len() < WRITE_CHUNK {
                match write_rx.try_recv() {
                    Ok(write) => chunk.push(write),
                    Err(_) => break,
                }
            }

            let written = async {
                let mut conn = state.conn().await?;
                tracks::record_analysis_many(&mut conn, &chunk).await.wire()
            }
            .await;

            if let Err(error) = written {
                cancel.cancel();
                outcome = Err(error);
                break;
            }
        }
        // Drain without writing once failed, so the batch side never blocks.
        while write_rx.recv().await.is_some() {}
        outcome
    };

    let (counts, written) = tokio::join!(batch, writer);
    let counts = counts?;
    written?;

    if cancel.is_cancelled() {
        emit(AnalysisProgress {
            current: settled.load(Ordering::SeqCst),
            total,
            track_name: String::new(),
            status: AnalysisStatus::Cancelled,
        });
    }

    Ok(counts)
}

/// The blocking half: a private rayon pool, one track per core.
///
/// Its own pool for the same reason the folder scan owns one
/// (`crates/shiranami-library/src/scan/parse.rs`): a library-wide analysis
/// runs for minutes and must not starve any other rayon user in the process.
/// Sized to the machine because the decode is CPU-bound — the scan's fixed 16
/// is an I/O-shaped inheritance this batch does not share.
fn run_decodes(
    input: &[AnalysisInput],
    stored_states: &[TrackAnalysisState],
    peaks_dir: Option<&Path>,
    cancel: &CancellationToken,
    writes: &tokio::sync::mpsc::UnboundedSender<AnalysisWrite>,
    emit: &(impl Fn(AnalysisProgress) + Send + Sync),
    settled: &AtomicUsize,
    total: usize,
) -> AnalysisBatchResult {
    let work = || {
        input
            .par_iter()
            .zip(stored_states.par_iter())
            .map(|(track, stored)| {
                analyse_one(
                    track, stored, peaks_dir, cancel, writes, emit, settled, total,
                )
            })
            .reduce(AnalysisBatchResult::default, AnalysisBatchResult::merge)
    };

    let threads = std::thread::available_parallelism().map_or(1, std::num::NonZeroUsize::get);
    match rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .thread_name(|index| format!("shiranami-analysis-{index}"))
        .build()
    {
        Ok(pool) => pool.install(work),
        Err(error) => {
            tracing::warn!(%error, "could not build the analysis thread pool; using the default");
            work()
        }
    }
}

/// One track: decide what it needs, decode once, settle.
///
/// Returns a one-hot [`AnalysisBatchResult`] for the rayon reduction. A track
/// abandoned to cancellation returns all-zero — it neither analysed, skipped
/// nor failed, and v1's loudness run made the same call by breaking out of its
/// loop without a tick.
fn analyse_one(
    track: &AnalysisInput,
    stored: &TrackAnalysisState,
    peaks_dir: Option<&Path>,
    cancel: &CancellationToken,
    writes: &tokio::sync::mpsc::UnboundedSender<AnalysisWrite>,
    emit: &(impl Fn(AnalysisProgress) + Send + Sync),
    settled: &AtomicUsize,
    total: usize,
) -> AnalysisBatchResult {
    if cancel.is_cancelled() {
        return AnalysisBatchResult::default();
    }

    let settle = |status: AnalysisStatus, counts: AnalysisBatchResult| {
        let current = settled.fetch_add(1, Ordering::SeqCst) + 1;
        emit(AnalysisProgress {
            current,
            total,
            track_name: track.title.clone(),
            status,
        });
        counts
    };
    let skipped = AnalysisBatchResult {
        skipped: 1,
        ..Default::default()
    };

    // One stat answers both "is it there" and the cache key's mtime/size. A
    // file that is gone is a skip, not a failure — an unplugged drive is not a
    // library full of broken files (the loudness run's exact reasoning).
    let path = Path::new(&track.file_path);
    let Ok(metadata) = std::fs::metadata(path) else {
        return settle(AnalysisStatus::Skipped, skipped);
    };
    if !metadata.is_file() {
        return settle(AnalysisStatus::Skipped, skipped);
    }

    // What this track is missing. Tempo and key travel as a pair: if either
    // column is empty both are re-estimated — same decode, deterministic same
    // values for the one already present — so the write below can always set
    // the pair together.
    let key = peaks_dir.map(|_| {
        cache::cache_key(
            &track.file_path,
            crate::commands::waveform::mtime_ms(&metadata),
            metadata.len(),
        )
    });
    let peaks_missing = match (peaks_dir, key.as_deref()) {
        (Some(dir), Some(key)) => cache::read_cached_peaks(dir, key).is_none(),
        // No cache directory means nowhere to persist a waveform; computing
        // one to throw it away would be pure heat.
        _ => false,
    };
    let tempo_key_missing = stored.bpm.is_none() || stored.musical_key.is_none();
    let request = AnalyzeRequest {
        peak_buckets: peaks_missing.then_some(WAVEFORM_PEAK_COUNT),
        loudness: stored.loudness_lufs.is_none(),
        tempo: tempo_key_missing,
        key: tempo_key_missing,
    };
    if request.is_empty() {
        return settle(AnalysisStatus::Skipped, skipped);
    }

    let analysis = match analyze_file(path, request) {
        Ok(analysis) => analysis,
        Err(error) if is_missing(&error) => {
            return settle(AnalysisStatus::Skipped, skipped);
        }
        Err(error) => {
            tracing::error!(%error, track = %track.title, "analysis failed");
            return settle(
                AnalysisStatus::Error,
                AnalysisBatchResult {
                    failed: 1,
                    ..Default::default()
                },
            );
        }
    };

    // The post-measurement re-check, as v1's loudness run made it: a result
    // that finished after the user cancelled is dropped, not persisted.
    if cancel.is_cancelled() {
        return AnalysisBatchResult::default();
    }

    // Peaks go straight to the disk cache — no database involved — through the
    // same create-exclusive write the waveform command uses, so a race against
    // a play-time decode writes identical bytes and loses harmlessly.
    if let (Some(dir), Some(cache_key), Some(peaks)) =
        (peaks_dir, key.as_deref(), analysis.peaks.as_ref())
        && let Err(error) = cache::write_cached_peaks(dir, cache_key, &peaks.peaks)
    {
        tracing::warn!(%error, "the waveform cache write failed");
    }

    // Loudness and tempo/key go to the write channel. Silence stores nothing,
    // as v1 stored nothing: −∞ LUFS is a measurement of nothing to level.
    let write = AnalysisWrite {
        id: track.id.clone(),
        loudness_lufs: analysis.loudness.and_then(|measured| match measured {
            IntegratedLoudness::Measured(lufs) => Some(lufs),
            IntegratedLoudness::Silent => None,
        }),
        bpm_key: tempo_key_missing
            .then(|| (analysis.bpm, analysis.key.map(|estimate| estimate.name))),
    };
    if write.loudness_lufs.is_some() || write.bpm_key.is_some() {
        // A closed channel means the writer already failed and cancelled the
        // run; the result is dropped with it.
        let _ = writes.send(write);
    }

    settle(
        AnalysisStatus::Done,
        AnalysisBatchResult {
            analyzed: 1,
            ..Default::default()
        },
    )
}

/// Whether this failure is "the file is not there" rather than "it will not
/// decode" — the same split the loudness run makes.
fn is_missing(error: &AudioError) -> bool {
    matches!(
        error,
        AudioError::Io { source, .. } if source.kind() == std::io::ErrorKind::NotFound
    )
}

/// Emit `analysis:progress`. A failed emit is dropped, as every progress
/// channel in this crate drops one for a destroyed window.
fn emit(app: &AppHandle, progress: AnalysisProgress) {
    let Ok(payload) = serde_json::to_value(&progress) else {
        tracing::warn!("an analysis progress tick could not be serialized");
        return;
    };

    let _ = AnalysisProgressEvent(Json(payload)).emit(app);
}

#[cfg(test)]
#[path = "tests/analysis.rs"]
mod tests;
