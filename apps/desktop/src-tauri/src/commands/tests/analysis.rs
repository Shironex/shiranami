//! `analysis:*` command tests: the busy contract, the run slot, and the
//! one-pass batch end to end against a real database and real audio files.

use super::*;
use crate::state::tests::state_over;
use shiranami_core::models::TrackCreateInput;
use std::sync::Mutex as StdMutex;

// ── the busy contract ────────────────────────────────────────────────────

/// Born in v2, so there is no v1 literal to pin against — this test *is* the
/// pin. The renderer will match on it to tell "already running" from a real
/// failure, exactly as it matches `loudness.busy`.
#[test]
fn the_busy_code_is_the_contract() {
    assert_eq!(ANALYSIS_BUSY_CODE, "analysis.busy");
}

#[test]
fn a_second_run_is_refused_under_the_busy_code() {
    let runs = AnalysisRuns::default();
    let _first = runs.claim().expect("the first claim succeeds");

    let error = runs.claim().expect_err("the second claim is refused");

    assert_eq!(error.code, ANALYSIS_BUSY_CODE);
}

#[test]
fn the_slot_is_reusable_once_the_run_finishes() {
    let runs = AnalysisRuns::default();

    drop(runs.claim().expect("the first claim succeeds"));

    runs.claim().expect("the slot is free again");
}

#[test]
fn cancelling_marks_the_active_run() {
    let runs = AnalysisRuns::default();
    let guard = runs.claim().expect("claim");

    assert!(!guard.token.is_cancelled());
    runs.cancel();
    assert!(guard.token.is_cancelled());
}

#[test]
fn cancelling_while_idle_does_not_poison_the_next_run() {
    let runs = AnalysisRuns::default();

    runs.cancel();

    let guard = runs.claim().expect("claim");
    assert!(!guard.token.is_cancelled());
}

/// Without the identity check, a run finishing after a newer one started
/// frees the newer one's slot, and a third run could start alongside it.
#[test]
fn a_late_finishing_run_does_not_release_a_newer_ones_slot() {
    let runs = AnalysisRuns::default();
    let first = runs.claim().expect("claim");

    {
        let mut active = lock(&runs.active);
        *active = Some(Run {
            token: CancellationToken::new(),
            generation: runs.generations.fetch_add(1, Ordering::SeqCst),
        });
    }

    drop(first);

    assert!(
        lock(&runs.active).is_some(),
        "the older run's cleanup cleared a slot it no longer owned"
    );
}

// ── the batch, end to end ────────────────────────────────────────────────

/// A mono 44.1 kHz WAV with a 120 BPM click over a C-major triad, so every
/// analyser has something real to measure. Written raw — 44-byte header plus
/// little-endian samples — so the test needs no encoder.
fn write_musical_wav(path: &Path) {
    const RATE: u32 = 44_100;
    let total = RATE as usize * 8;
    let period = RATE as usize / 2;
    let burst = RATE as usize / 20;

    let samples: Vec<i16> = (0..total)
        .map(|n| {
            let t = n as f64 / f64::from(RATE);
            let triad: f64 = [261.63, 329.63, 392.00]
                .iter()
                .map(|f| (std::f64::consts::TAU * f * t).sin())
                .sum::<f64>()
                / 3.0;
            let click = if n % period < burst { 0.6 } else { 0.0 };
            ((triad * 0.25 + click) * 32_000.0).clamp(-32_768.0, 32_767.0) as i16
        })
        .collect();

    let data_len = u32::try_from(samples.len() * 2).expect("fixture fits");
    let mut out = Vec::with_capacity(44 + samples.len() * 2);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16_u32.to_le_bytes());
    out.extend_from_slice(&1_u16.to_le_bytes());
    out.extend_from_slice(&1_u16.to_le_bytes());
    out.extend_from_slice(&RATE.to_le_bytes());
    out.extend_from_slice(&(RATE * 2).to_le_bytes());
    out.extend_from_slice(&2_u16.to_le_bytes());
    out.extend_from_slice(&16_u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for sample in &samples {
        out.extend_from_slice(&sample.to_le_bytes());
    }
    std::fs::write(path, out).expect("write the wav fixture");
}

/// Seed one track row pointing at `file_path`.
async fn seed_track(state: &AppState, file_path: &str, title: &str) -> String {
    let mut conn = state.conn().await.expect("acquire");
    tracks::add(
        &mut conn,
        &TrackCreateInput {
            file_path: file_path.to_owned(),
            title: title.to_owned(),
            ..TrackCreateInput::default()
        },
    )
    .await
    .expect("seed")
    .expect("a row")
    .id
}

/// Run the batch with a collecting emitter and no cancellation.
async fn run_collecting(
    state: &AppState,
    peaks_dir: Option<PathBuf>,
    input: Vec<AnalysisInput>,
) -> (AnalysisBatchResult, Vec<AnalysisProgress>) {
    let ticks = Arc::new(StdMutex::new(Vec::new()));
    let sink = Arc::clone(&ticks);
    let counts = run_batch(state, peaks_dir, input, CancellationToken::new(), {
        move |progress| sink.lock().expect("collect").push(progress)
    })
    .await
    .expect("the batch resolves");

    let ticks = ticks.lock().expect("read").clone();
    (counts, ticks)
}

/// The whole story in one run: a real file is decoded once and comes out with
/// loudness, tempo and key on its row and 512 peaks in the cache; a missing
/// file skips; garbage fails. Then a second run skips the analysed track
/// entirely — the idempotence that makes "Analyze library" safe to re-press.
#[tokio::test]
async fn the_batch_measures_persists_and_then_skips() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let peaks_dir = dir.path().join("waveform-peaks");

    let wav = dir.path().join("musical.wav");
    write_musical_wav(&wav);
    let garbage = dir.path().join("garbage.mp3");
    std::fs::write(&garbage, b"not audio at all").expect("write the decoy");

    let analysed = seed_track(&state, &wav.to_string_lossy(), "Musical").await;
    let missing = seed_track(&state, "/nowhere/gone.mp3", "Gone").await;
    let broken = seed_track(&state, &garbage.to_string_lossy(), "Broken").await;

    let input = vec![
        AnalysisInput {
            id: analysed.clone(),
            file_path: wav.to_string_lossy().into_owned(),
            title: "Musical".to_owned(),
        },
        AnalysisInput {
            id: missing,
            file_path: "/nowhere/gone.mp3".to_owned(),
            title: "Gone".to_owned(),
        },
        AnalysisInput {
            id: broken,
            file_path: garbage.to_string_lossy().into_owned(),
            title: "Broken".to_owned(),
        },
    ];

    let (counts, ticks) = run_collecting(&state, Some(peaks_dir.clone()), input.clone()).await;

    assert_eq!(
        counts,
        AnalysisBatchResult {
            analyzed: 1,
            skipped: 1,
            failed: 1,
        }
    );
    assert_eq!(ticks.len(), 3, "one settled tick per track: {ticks:?}");
    assert_eq!(
        ticks.iter().map(|tick| tick.total).max(),
        Some(3),
        "every tick carries the batch size"
    );

    // The measurements landed on the row.
    {
        let mut conn = state.conn().await.expect("acquire");
        let stored = tracks::analysis_state(&mut conn, &analysed)
            .await
            .expect("read")
            .expect("the row exists");
        let lufs = stored.loudness_lufs.expect("loudness measured");
        assert!(
            lufs < 0.0,
            "a real signal measures below full scale: {lufs}"
        );
        let bpm = stored.bpm.expect("a click track has a tempo");
        assert!((bpm - 120.0).abs() <= 6.0, "estimated {bpm} BPM");
        assert_eq!(stored.musical_key.as_deref(), Some("C major"));
    }

    // The peaks cache holds one entry with the frozen bucket count.
    let cached: Vec<_> = std::fs::read_dir(&peaks_dir)
        .expect("the cache directory exists")
        .collect();
    assert_eq!(cached.len(), 1, "one analysed track, one cache entry");
    let entry = cached[0].as_ref().expect("a cache entry").path();
    let key = entry
        .file_stem()
        .and_then(|stem| stem.to_str())
        .expect("a hex key");
    let peaks = shiranami_audio::peaks::cache::read_cached_peaks(&peaks_dir, key)
        .expect("the entry parses");
    assert_eq!(peaks.len(), shiranami_audio::WAVEFORM_PEAK_COUNT);

    // Second run: the analysed track needs nothing — no decode, a skip. The
    // missing file stays a skip and the garbage fails again.
    let (again, _) = run_collecting(&state, Some(peaks_dir), input).await;
    assert_eq!(
        again,
        AnalysisBatchResult {
            analyzed: 0,
            skipped: 2,
            failed: 1,
        }
    );
}

/// A pre-cancelled run settles nothing, emits exactly one `cancelled` tick,
/// and still resolves with its (empty) partial counts rather than rejecting —
/// cancellation is not a failure, per the loudness precedent.
#[tokio::test]
async fn a_cancelled_run_returns_partial_counts_and_one_tick() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;

    let wav = dir.path().join("musical.wav");
    write_musical_wav(&wav);
    let id = seed_track(&state, &wav.to_string_lossy(), "Musical").await;

    let token = CancellationToken::new();
    token.cancel();

    let ticks = Arc::new(StdMutex::new(Vec::new()));
    let sink = Arc::clone(&ticks);
    let counts = run_batch(
        &state,
        None,
        vec![AnalysisInput {
            id: id.clone(),
            file_path: wav.to_string_lossy().into_owned(),
            title: "Musical".to_owned(),
        }],
        token,
        move |progress| sink.lock().expect("collect").push(progress),
    )
    .await
    .expect("a cancelled run resolves");

    assert_eq!(counts, AnalysisBatchResult::default());

    {
        let ticks = ticks.lock().expect("read");
        assert_eq!(ticks.len(), 1);
        assert_eq!(ticks[0].status, AnalysisStatus::Cancelled);
        assert_eq!(ticks[0].current, 0);
        assert_eq!(ticks[0].track_name, "");
    }

    // And nothing was persisted for the abandoned track.
    let mut conn = state.conn().await.expect("acquire");
    let stored = tracks::analysis_state(&mut conn, &id)
        .await
        .expect("read")
        .expect("the row exists");
    assert_eq!(stored, TrackAnalysisState::default());
}

/// Without a peaks directory the request drops the waveform but the database
/// measurements still land — the same "no data dir, skip the artefact, keep
/// the analysis" trade the scanner makes for cover art.
#[tokio::test]
async fn a_run_without_a_cache_directory_still_persists_measurements() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;

    let wav = dir.path().join("musical.wav");
    write_musical_wav(&wav);
    let id = seed_track(&state, &wav.to_string_lossy(), "Musical").await;

    let (counts, _) = run_collecting(
        &state,
        None,
        vec![AnalysisInput {
            id: id.clone(),
            file_path: wav.to_string_lossy().into_owned(),
            title: "Musical".to_owned(),
        }],
    )
    .await;

    assert_eq!(counts.analyzed, 1);

    let mut conn = state.conn().await.expect("acquire");
    let stored = tracks::analysis_state(&mut conn, &id)
        .await
        .expect("read")
        .expect("the row exists");
    assert!(stored.loudness_lufs.is_some());
    assert!(stored.bpm.is_some());
    assert!(stored.musical_key.is_some());
}
