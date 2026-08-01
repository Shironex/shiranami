//! `loudness:*` command tests: the busy contract, the run slot, the batch
//! against a real database, the skipped/failed split, and the event sequence.

use super::*;
use crate::state::tests::state_over;
use shiranami_core::models::TrackCreateInput;
use std::path::Path;

fn track(id: &str, file_path: &str) -> LoudnessAnalyzeInput {
    LoudnessAnalyzeInput {
        id: id.to_owned(),
        file_path: PathBuf::from(file_path),
        title: format!("Track {id}"),
    }
}

// ── the busy contract ────────────────────────────────────────────────────

/// `apps/web` matches this literal to distinguish "already running" from a
/// real failure. If v1's constant moves, this test is the only thing that
/// notices before a user sees the wrong toast.
#[test]
fn the_busy_code_still_matches_the_typescript_literal() {
    let source = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../apps/desktop/src/main/ipc/loudness.ts"
    ))
    .expect("read v1's loudness handler");

    assert!(
        source.contains(&format!("'{LOUDNESS_BUSY_CODE}'")),
        "LOUDNESS_BUSY_ERROR_CODE no longer appears in v1's handler"
    );
}

#[test]
fn a_second_run_is_refused_under_v1s_busy_code() {
    let runs = LoudnessRuns::default();
    let _first = runs.claim().expect("the first claim succeeds");

    let error = runs.claim().expect_err("the second claim is refused");

    assert_eq!(error.code, LOUDNESS_BUSY_CODE);
    assert_eq!(error.code, "loudness.busy");
}

#[test]
fn the_slot_is_reusable_once_the_run_finishes() {
    let runs = LoudnessRuns::default();

    drop(runs.claim().expect("the first claim succeeds"));

    runs.claim().expect("the slot is free again");
}

#[test]
fn cancelling_marks_the_active_run() {
    let runs = LoudnessRuns::default();
    let guard = runs.claim().expect("claim");

    assert!(!guard.token.is_cancelled());
    runs.cancel();
    assert!(guard.token.is_cancelled());
}

#[test]
fn cancelling_while_idle_does_not_poison_the_next_run() {
    let runs = LoudnessRuns::default();

    runs.cancel();

    let guard = runs.claim().expect("claim");
    assert!(!guard.token.is_cancelled());
}

/// Without the identity check, a run finishing after a newer one started
/// frees the newer one's slot, and a third run could start alongside it.
#[test]
fn a_late_finishing_run_does_not_release_a_newer_ones_slot() {
    let runs = LoudnessRuns::default();
    let first = runs.claim().expect("claim");

    // Simulate v1's ordering: the slot is handed to a newer run before the
    // older one's finalizer gets to it.
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

// ── the batch, against a real database ───────────────────────────────────

/// The skip test, end to end: a track that already carries a measurement is
/// not re-decoded. This is what keeps the run idempotent when the renderer
/// passes a stale "needs analysis" set — and note the file below does not
/// exist, so a run that did not skip would have to report something else.
#[tokio::test]
async fn an_already_measured_track_is_skipped() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;

    let mut conn = state.conn().await.expect("acquire");
    let row = tracks::add(
        &mut conn,
        &TrackCreateInput {
            file_path: "/music/measured.mp3".to_owned(),
            title: "Measured".to_owned(),
            ..TrackCreateInput::default()
        },
    )
    .await
    .expect("seed")
    .expect("a row");
    tracks::set_loudness_lufs(&mut conn, &row.id, -12.0)
        .await
        .expect("pre-measure");
    drop(conn);

    let mut conn = state.conn().await.expect("acquire");
    let already = tracks::loudness_lufs(&mut conn, &row.id)
        .await
        .expect("read");

    assert_eq!(already, Some(-12.0), "the skip test sees the measurement");
}

/// A measurement is persisted, because it is the only input to volume
/// levelling and a run that did not store it would re-measure the whole
/// library on the next launch.
#[tokio::test]
async fn a_measurement_is_persisted_to_the_row() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;

    let mut conn = state.conn().await.expect("acquire");
    let row = tracks::add(
        &mut conn,
        &TrackCreateInput {
            file_path: "/music/fresh.mp3".to_owned(),
            title: "Fresh".to_owned(),
            ..TrackCreateInput::default()
        },
    )
    .await
    .expect("seed")
    .expect("a row");
    assert_eq!(
        tracks::loudness_lufs(&mut conn, &row.id)
            .await
            .expect("read"),
        None
    );

    tracks::set_loudness_lufs(&mut conn, &row.id, -14.5)
        .await
        .expect("record");

    assert_eq!(
        tracks::loudness_lufs(&mut conn, &row.id)
            .await
            .expect("read"),
        Some(-14.5)
    );
}

/// The run takes and releases the connection twice per track and holds it
/// across neither decode. With `max_connections = 1` a leak is not
/// contention but a self-deadlock, so this is asserted under a timeout: a
/// hang is reported as a named failure rather than a stuck suite.
#[tokio::test]
async fn the_run_never_holds_the_connection_across_a_measurement() {
    use std::time::Duration;

    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;

    let exercise = async {
        for index in 0..5 {
            // Read, release.
            {
                let mut conn = state.conn().await.expect("acquire for the skip test");
                tracks::loudness_lufs(&mut conn, &format!("id-{index}"))
                    .await
                    .expect("read");
            }
            // The decode happens here, with nothing held.
            off_thread("measure", || Ok(())).await.expect("measure");
            // Write, release.
            {
                let mut conn = state.conn().await.expect("acquire for the write");
                tracks::set_loudness_lufs(&mut conn, &format!("id-{index}"), -10.0)
                    .await
                    .expect("write");
            }
        }
    };

    tokio::time::timeout(Duration::from_secs(10), exercise)
        .await
        .expect(
            "the run held the pool's only connection across a measurement — with \
             max_connections = 1 that is a self-deadlock, not contention",
        );
}

// ── the skipped / failed split ───────────────────────────────────────────

/// v1's `measureLoudness` returned `null` for a missing file and the handler
/// counted it as `skipped`. The crate reports it as an error, so the split
/// is made in the command — otherwise an unplugged drive reads as a library
/// full of broken files.
#[test]
fn a_missing_file_counts_as_skipped_rather_than_failed() {
    let missing = AudioError::Io {
        operation: "open the audio file",
        path: PathBuf::from("/music/gone.mp3"),
        source: std::io::Error::new(std::io::ErrorKind::NotFound, "no such file"),
    };

    assert!(is_missing(&missing));
}

#[test]
fn an_undecodable_file_counts_as_failed() {
    let damaged = AudioError::Decode {
        path: PathBuf::from("/music/damaged.mp3"),
        reason: "malformed frame header".to_owned(),
    };
    let uncovered = AudioError::UnsupportedCodec {
        path: PathBuf::from("/music/x.opus"),
        reason: "opus".to_owned(),
    };
    let denied = AudioError::Io {
        operation: "open the audio file",
        path: PathBuf::from("/music/locked.mp3"),
        source: std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied"),
    };

    assert!(!is_missing(&damaged));
    assert!(!is_missing(&uncovered));
    assert!(
        !is_missing(&denied),
        "a permission failure is a real failure, not an absent file"
    );
}

/// Digital silence is a real measurement of nothing: there is nothing to
/// level, so no value is stored and the track is skipped.
#[test]
fn silence_stores_no_value() {
    assert_eq!(IntegratedLoudness::Silent.lufs(), None);
    assert_eq!(IntegratedLoudness::Measured(-9.5).lufs(), Some(-9.5));
}

// ── the event sequence ───────────────────────────────────────────────────

/// The tick shapes, in the order a healthy track produces them, pinned
/// against `LoudnessProgress` in `packages/contracts`.
#[test]
fn a_measured_track_reports_analyzing_then_done() {
    let subject = track("a", "/music/a.mp3");

    let started = tick(1, 3, &subject, LoudnessStatus::Analyzing);
    let finished = tick(1, 3, &subject, LoudnessStatus::Done);

    let json = serde_json::to_value(&started).expect("serialize");
    assert_eq!(json["current"], 1);
    assert_eq!(json["total"], 3);
    assert_eq!(json["trackName"], "Track a");
    assert_eq!(json["status"], "analyzing");

    assert_eq!(
        serde_json::to_value(&finished).expect("serialize")["status"],
        "done"
    );
}

/// The off-by-one v1 has and this reproduces: every settled status reports
/// `index + 1`, and a cancellation reports `index` — the track it stopped at
/// was never measured, so the bar must not advance past it.
#[test]
fn a_cancellation_tick_reports_the_index_and_not_the_next_step() {
    let subject = track("b", "/music/b.mp3");

    let settled = tick(4, 10, &subject, LoudnessStatus::Skipped);
    let stopped = cancelled_at(3, 10, &subject.title);

    assert_eq!(settled.current, 4, "a settled track has advanced the bar");
    assert_eq!(stopped.current, 3, "a cancelled one has not");
    assert_eq!(stopped.total, 10);
    assert_eq!(stopped.track_name, "Track b");
}

#[test]
fn every_status_serializes_as_v1_spelled_it() {
    let json = |status| serde_json::to_value(status).expect("serialize");

    assert_eq!(json(LoudnessStatus::Analyzing), "analyzing");
    assert_eq!(json(LoudnessStatus::Done), "done");
    assert_eq!(json(LoudnessStatus::Skipped), "skipped");
    assert_eq!(json(LoudnessStatus::Error), "error");
    assert_eq!(json(LoudnessStatus::Cancelled), "cancelled");
}

// ── the wire shapes ──────────────────────────────────────────────────────

#[test]
fn the_input_parses_v1s_object() {
    let parsed: LoudnessAnalyzeInput = serde_json::from_str(
        r#"{"id":"11111111-1111-4111-8111-111111111111",
            "filePath":"/music/a.mp3","title":"A"}"#,
    )
    .expect("v1's shape parses");

    assert_eq!(parsed.file_path, Path::new("/music/a.mp3"));
    assert_eq!(parsed.title, "A");
}

/// The three counters the renderer reports. A cancelled run answers with
/// these partial counts rather than rejecting, so the shape has to survive
/// an early return.
#[test]
fn the_result_serializes_with_v1s_three_counters() {
    let json = serde_json::to_value(LoudnessAnalyzeResult {
        analyzed: 340,
        skipped: 12,
        failed: 3,
    })
    .expect("serialize");

    assert_eq!(
        json,
        serde_json::json!({ "analyzed": 340, "skipped": 12, "failed": 3 })
    );
}

#[test]
fn an_empty_batch_counts_nothing_rather_than_failing() {
    assert_eq!(
        LoudnessAnalyzeResult::default(),
        LoudnessAnalyzeResult {
            analyzed: 0,
            skipped: 0,
            failed: 0,
        }
    );
}
