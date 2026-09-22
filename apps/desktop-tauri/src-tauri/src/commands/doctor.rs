//! `doctor:*` — the Library Doctor: decode-truth health findings (F8).
//!
//! No v1 counterpart. The decoder has always measured more than the loudness
//! run kept: a truncated download ends mid-packet and the loop breaks, a
//! damaged frame is skipped, a container's duration field can lie about the
//! frames that actually decode, a master can peak past full scale, a file can
//! be digital silence. Every one of those was discarded on the floor of
//! `shiranami_audio::decode_file` until the summary started carrying them —
//! this namespace decodes each submitted file once and turns the by-products
//! into a per-file report.
//!
//! # Findings are informative, never auto-fixing
//!
//! The command returns findings; it deletes nothing, rewrites nothing and
//! touches no database row. Opus/WMA files are reported as *unsupported* —
//! "this build cannot analyse it" — never as broken: they play fine in the
//! webview, and calling them damaged would be a false accusation.
//!
//! # Shape
//!
//! The run machinery is `loudness`'s, deliberately: a claim-or-refuse slot
//! (`doctor.busy`), per-track progress ticks on a dedicated event, per-track
//! cancellation checkpoints, and partial results on cancel. Like `library`,
//! no command here takes [`crate::state::AppState`] — the renderer supplies
//! the tracks and receives the findings; rows are never written.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use shiranami_audio::{
    AudioError, DecodeSummary, IntegratedLoudness, LoudnessAnalyzer, LoudnessProfile, decode_file,
};
use shiranami_core::error::ErrorPayload;
use specta::Type;
// The same `usize` → `Number` projection the loudness counters use.
use specta_typescript::Number;
use tauri::{AppHandle, State};
use tauri_specta::Event as _;
use tokio_util::sync::CancellationToken;

use crate::error::CommandResult;
use crate::events::DoctorProgress as DoctorProgressEvent;
use crate::wire::Json;
use crate::wire::off_thread;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::doctor::doctor_scan,
                crate::commands::doctor::doctor_cancel,
            ]
        }
    };
}
pub(crate) use commands;

/// The renderer-visible code for "a health check is already in progress".
///
/// Declared here like `loudness.busy` is declared in its handler: a v2-only
/// code, so there is no v1 literal to pin against.
pub const DOCTOR_BUSY_CODE: &str = "doctor.busy";

/// Flag the decoded length only when it misses the container's claim by more
/// than this or 5% of the claim, whichever is larger — tag durations are
/// routinely a second off without anything being wrong.
const DURATION_TOLERANCE_SECS: f64 = 2.0;

// ── wire types ───────────────────────────────────────────────────────────────

/// One track offered up for a health check.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DoctorScanInput {
    /// The library row, echoed on findings so the renderer can link back.
    pub id: String,
    /// The file to decode.
    pub file_path: PathBuf,
    /// Display title, echoed on progress ticks and findings.
    pub title: String,
    /// The duration the library believes (container/tag metadata, seconds).
    /// Compared against the frames that actually decode.
    #[specta(optional)]
    pub duration: Option<f64>,
}

/// What kind of defect (or caveat) a finding reports.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum DoctorFindingKind {
    /// The file is gone from disk.
    MissingFile,
    /// The container would not open or the decode failed outright.
    Unreadable,
    /// The container holds no audio stream.
    NoAudio,
    /// The codec is outside this build's coverage (Opus/WMA) — the file is
    /// not analysable here, which is not the same as broken.
    UnsupportedCodec,
    /// The stream ends mid-packet: a truncated or half-downloaded file.
    Truncated,
    /// Some packets would not decode and were skipped.
    DamagedPackets,
    /// The container's duration claim disagrees with the decoded length.
    DurationMismatch,
    /// The master's true peak clears full scale (inter-sample clipping).
    Clipping,
    /// The audio is digital silence end to end.
    Silent,
}

/// How loudly the renderer should present a finding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum DoctorSeverity {
    /// The file cannot be played or read as audio.
    Error,
    /// The file plays, but part of it is missing or damaged.
    Warning,
    /// Worth knowing; nothing is wrong with the file on disk.
    Info,
}

/// One per-file finding.
///
/// Numbers ride as typed fields rather than a prebuilt message so the
/// renderer owns the copy (en + pl) and the formatting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DoctorFinding {
    /// The library row this is about.
    pub track_id: String,
    /// Display title, so the report reads without a library join.
    pub title: String,
    /// The file on disk.
    pub file_path: PathBuf,
    /// What was found.
    pub kind: DoctorFindingKind,
    /// How loudly to present it.
    pub severity: DoctorSeverity,
    /// `DurationMismatch`: what the container claims, in seconds.
    #[specta(optional)]
    pub expected_seconds: Option<f64>,
    /// `DurationMismatch`: what actually decoded, in seconds.
    #[specta(optional)]
    pub actual_seconds: Option<f64>,
    /// `DamagedPackets`: how many packets were skipped.
    #[specta(optional)]
    #[specta(type = Option<Number>)]
    pub skipped_packets: Option<u64>,
    /// `Clipping`: the measured true peak, in dBTP.
    #[specta(optional)]
    pub true_peak_db: Option<f64>,
}

/// What a finished — or cancelled — health check covered.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DoctorScanResult {
    /// Files examined (including the ones findings are about).
    #[specta(type = Number)]
    pub scanned: usize,
    /// Files with nothing to report.
    #[specta(type = Number)]
    pub healthy: usize,
    /// Whether the run stopped early at the user's request. The findings are
    /// the partial truth up to that point, not a failure.
    pub cancelled: bool,
    /// Every finding, in scan order. One file can produce several.
    pub findings: Vec<DoctorFinding>,
}

/// One progress tick, on `doctor:progress`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DoctorProgress {
    /// Files settled so far.
    #[specta(type = Number)]
    pub current: usize,
    /// How many files the run covers.
    #[specta(type = Number)]
    pub total: usize,
    /// The file under examination, for display.
    pub track_name: String,
}

// ── the run slot ─────────────────────────────────────────────────────────────

/// The one in-flight health check, as managed state. `loudness::LoudnessRuns`'
/// claim-or-refuse shape, for the same reason: the renderer disables the
/// trigger, and a second run racing the first would double-decode the library.
#[derive(Debug, Default)]
pub struct DoctorRuns {
    active: Mutex<Option<Run>>,
    generations: AtomicU64,
}

/// The run currently holding the slot.
#[derive(Debug)]
struct Run {
    token: CancellationToken,
    generation: u64,
}

impl DoctorRuns {
    /// Take the slot, or fail with [`DOCTOR_BUSY_CODE`].
    fn claim(&self) -> CommandResult<RunGuard<'_>> {
        let mut active = lock(&self.active);

        if active.is_some() {
            return Err(ErrorPayload {
                code: DOCTOR_BUSY_CODE.to_owned(),
                message: "A library health check is already in progress.".to_owned(),
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

    /// Cancel the active run; a silent no-op when idle.
    fn cancel(&self) {
        if let Some(run) = lock(&self.active).as_ref() {
            tracing::info!("doctor cancellation requested");
            run.token.cancel();
        }
    }
}

/// Proof that the caller holds the run slot; releases it on drop.
#[derive(Debug)]
struct RunGuard<'runs> {
    runs: &'runs DoctorRuns,
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

/// `doctor:cancel` — stop the active health check.
///
/// Best-effort: the run notices at its next per-file checkpoint and returns
/// its partial findings.
#[tauri::command]
#[specta::specta]
pub async fn doctor_cancel(runs: State<'_, DoctorRuns>) -> CommandResult<()> {
    runs.cancel();
    Ok(())
}

/// `doctor:scan` — decode every submitted file once and report what only a
/// real decoder can see.
///
/// Sequential, one file at a time, like the loudness batch and for the same
/// reason: the decode is CPU-saturating and the unit of work is a track.
#[tauri::command]
#[specta::specta]
pub async fn doctor_scan(
    app: AppHandle,
    runs: State<'_, DoctorRuns>,
    input: Vec<DoctorScanInput>,
) -> CommandResult<DoctorScanResult> {
    let guard = runs.claim()?;
    let cancel = guard.token.clone();
    let total = input.len();
    let mut result = DoctorScanResult::default();

    for track in &input {
        if cancel.is_cancelled() {
            result.cancelled = true;
            break;
        }

        emit(
            &app,
            DoctorProgress {
                current: result.scanned + 1,
                total,
                track_name: track.title.clone(),
            },
        );

        let file_path = track.file_path.clone();
        let outcome = off_thread("examine the file", move || Ok(examine_file(&file_path))).await?;

        if cancel.is_cancelled() {
            result.cancelled = true;
            break;
        }

        result.scanned += 1;
        let findings = classify(track, &outcome);
        if findings.is_empty() {
            result.healthy += 1;
        } else {
            result.findings.extend(findings);
        }
    }

    tracing::info!(
        scanned = result.scanned,
        healthy = result.healthy,
        findings = result.findings.len(),
        cancelled = result.cancelled,
        total,
        "library health check complete"
    );

    Ok(result)
}

// ── examination and classification ───────────────────────────────────────────

/// One decode's worth of evidence about a file.
type Examination = Result<(DecodeSummary, LoudnessProfile), AudioError>;

/// Decode the file once, with the loudness analyser riding along for the
/// true-peak and silence findings.
fn examine_file(path: &Path) -> Examination {
    let mut analyzer = LoudnessAnalyzer::new();
    let summary = decode_file(path, &mut analyzer)?;
    let profile = analyzer.profile()?;
    Ok((summary, profile))
}

/// Turn one file's evidence into findings. Pure, so the taxonomy is testable
/// without fixture files.
fn classify(track: &DoctorScanInput, examination: &Examination) -> Vec<DoctorFinding> {
    let finding = |kind, severity| DoctorFinding {
        track_id: track.id.clone(),
        title: track.title.clone(),
        file_path: track.file_path.clone(),
        kind,
        severity,
        expected_seconds: None,
        actual_seconds: None,
        skipped_packets: None,
        true_peak_db: None,
    };

    let (summary, profile) = match examination {
        // A file that is simply gone: one clear finding, not a decode error.
        Err(error) if is_missing(error) => {
            return vec![finding(
                DoctorFindingKind::MissingFile,
                DoctorSeverity::Error,
            )];
        }
        // Cannot analyse ≠ broken: Opus/WMA play fine in the webview.
        Err(AudioError::UnsupportedCodec { .. }) => {
            return vec![finding(
                DoctorFindingKind::UnsupportedCodec,
                DoctorSeverity::Info,
            )];
        }
        Err(AudioError::NoAudioTrack { .. }) => {
            return vec![finding(DoctorFindingKind::NoAudio, DoctorSeverity::Error)];
        }
        Err(_) => {
            return vec![finding(
                DoctorFindingKind::Unreadable,
                DoctorSeverity::Error,
            )];
        }
        Ok(evidence) => evidence,
    };

    let mut findings = Vec::new();

    if summary.truncated {
        findings.push(finding(
            DoctorFindingKind::Truncated,
            DoctorSeverity::Warning,
        ));
    }

    if summary.skipped_packets > 0 {
        let mut damaged = finding(DoctorFindingKind::DamagedPackets, DoctorSeverity::Warning);
        damaged.skipped_packets = Some(summary.skipped_packets);
        findings.push(damaged);
    }

    // The duration lie — but only when the file is otherwise whole: a
    // truncated file's decoded length *necessarily* misses the claim, and two
    // findings saying one thing is alarm fatigue.
    if !summary.truncated
        && let Some(expected) = track
            .duration
            .filter(|claim| claim.is_finite() && *claim > 0.0)
    {
        let actual = summary.duration_secs();
        let tolerance = DURATION_TOLERANCE_SECS.max(expected * 0.05);
        if (actual - expected).abs() > tolerance {
            let mut lie = finding(DoctorFindingKind::DurationMismatch, DoctorSeverity::Warning);
            lie.expected_seconds = Some(expected);
            lie.actual_seconds = Some(actual);
            findings.push(lie);
        }
    }

    if let Some(peak) = profile.true_peak_db.filter(|db| *db > 0.0) {
        let mut clipping = finding(DoctorFindingKind::Clipping, DoctorSeverity::Info);
        clipping.true_peak_db = Some(peak);
        findings.push(clipping);
    }

    if profile.integrated == IntegratedLoudness::Silent {
        findings.push(finding(DoctorFindingKind::Silent, DoctorSeverity::Info));
    }

    findings
}

/// Whether this failure is "the file is not there" — the same split the
/// loudness batch makes, for the same reason: an unplugged drive must not
/// read as a library full of broken files (it reads as a library of missing
/// ones, which is the truth).
fn is_missing(error: &AudioError) -> bool {
    matches!(
        error,
        AudioError::Io { source, .. } if source.kind() == std::io::ErrorKind::NotFound
    )
}

/// Emit `doctor:progress`; a failed emit is dropped, as every progress
/// channel does.
fn emit(app: &AppHandle, progress: DoctorProgress) {
    let Ok(payload) = serde_json::to_value(&progress) else {
        tracing::warn!("a doctor progress tick could not be serialized");
        return;
    };

    let _ = DoctorProgressEvent(Json(payload)).emit(app);
}

#[cfg(test)]
#[path = "tests/doctor.rs"]
mod tests;
