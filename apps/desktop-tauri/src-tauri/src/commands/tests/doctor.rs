//! `doctor:*` command tests: the busy contract and the findings taxonomy.
//!
//! The taxonomy is pure (`classify` takes evidence, returns findings), so
//! every rule is pinned without fixture audio; the decode-side truth of the
//! evidence itself is `shiranami-audio`'s to prove.

use super::*;
use shiranami_audio::PcmSpec;

fn track(id: &str, duration: Option<f64>) -> DoctorScanInput {
    DoctorScanInput {
        id: id.to_owned(),
        file_path: PathBuf::from(format!("/music/{id}.mp3")),
        title: format!("Track {id}"),
        duration,
    }
}

fn summary(frames: u64, truncated: bool, skipped_packets: u64) -> DecodeSummary {
    DecodeSummary {
        spec: PcmSpec {
            channels: 2,
            sample_rate: 48_000,
        },
        frames,
        truncated,
        skipped_packets,
    }
}

fn profile(lufs: Option<f64>, true_peak_db: Option<f64>) -> LoudnessProfile {
    LoudnessProfile {
        integrated: match lufs {
            Some(value) => IntegratedLoudness::Measured(value),
            None => IntegratedLoudness::Silent,
        },
        true_peak_db,
        loudness_range: Some(4.0),
    }
}

/// Five seconds of healthy 48 kHz stereo.
fn healthy_evidence() -> Examination {
    Ok((summary(240_000, false, 0), profile(Some(-14.0), Some(-1.5))))
}

// ── the busy contract ────────────────────────────────────────────────────

#[test]
fn a_second_run_is_refused_under_the_doctor_busy_code() {
    let runs = DoctorRuns::default();
    let _first = runs.claim().expect("the first claim succeeds");

    let error = runs.claim().expect_err("the second claim is refused");

    assert_eq!(error.code, DOCTOR_BUSY_CODE);
    assert_eq!(error.code, "doctor.busy");
}

#[test]
fn the_slot_is_reusable_once_the_run_finishes() {
    let runs = DoctorRuns::default();

    drop(runs.claim().expect("the first claim succeeds"));

    runs.claim().expect("the slot is free again");
}

#[test]
fn cancelling_marks_the_active_run_and_idle_cancel_is_harmless() {
    let runs = DoctorRuns::default();
    runs.cancel(); // idle: nothing to poison

    let guard = runs.claim().expect("claim");
    assert!(!guard.token.is_cancelled());
    runs.cancel();
    assert!(guard.token.is_cancelled());
}

// ── the findings taxonomy ────────────────────────────────────────────────

#[test]
fn a_healthy_file_produces_no_findings() {
    assert!(classify(&track("a", Some(5.0)), &healthy_evidence()).is_empty());
}

#[test]
fn a_missing_file_is_one_clear_finding_not_a_decode_error() {
    let evidence: Examination = Err(AudioError::Io {
        operation: "open the audio file",
        path: PathBuf::from("/music/gone.mp3"),
        source: std::io::Error::new(std::io::ErrorKind::NotFound, "no such file"),
    });

    let findings = classify(&track("a", None), &evidence);

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].kind, DoctorFindingKind::MissingFile);
    assert_eq!(findings[0].severity, DoctorSeverity::Error);
}

/// Opus/WMA decode fine in the webview — "cannot analyse" must never read
/// as "broken". This is the false accusation the research warns about.
#[test]
fn an_unsupported_codec_is_informative_never_an_error() {
    let evidence: Examination = Err(AudioError::UnsupportedCodec {
        path: PathBuf::from("/music/x.opus"),
        reason: "opus".to_owned(),
    });

    let findings = classify(&track("a", None), &evidence);

    assert_eq!(findings[0].kind, DoctorFindingKind::UnsupportedCodec);
    assert_eq!(findings[0].severity, DoctorSeverity::Info);
}

#[test]
fn unreadable_and_no_audio_are_errors() {
    let unreadable: Examination = Err(AudioError::Decode {
        path: PathBuf::from("/music/x.mp3"),
        reason: "malformed".to_owned(),
    });
    let no_audio: Examination = Err(AudioError::NoAudioTrack {
        path: PathBuf::from("/music/x.mp4"),
    });

    assert_eq!(
        classify(&track("a", None), &unreadable)[0].kind,
        DoctorFindingKind::Unreadable
    );
    assert_eq!(
        classify(&track("a", None), &no_audio)[0].kind,
        DoctorFindingKind::NoAudio
    );
}

#[test]
fn a_truncated_file_is_a_warning_and_suppresses_the_duration_mismatch() {
    // 2.5 s decoded of a claimed 200 s — the truncation *is* the mismatch,
    // and two findings saying one thing is alarm fatigue.
    let evidence: Examination = Ok((summary(120_000, true, 0), profile(Some(-14.0), Some(-2.0))));

    let findings = classify(&track("a", Some(200.0)), &evidence);

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].kind, DoctorFindingKind::Truncated);
    assert_eq!(findings[0].severity, DoctorSeverity::Warning);
}

#[test]
fn skipped_packets_are_counted_into_the_finding() {
    let evidence: Examination = Ok((summary(240_000, false, 7), profile(Some(-14.0), Some(-2.0))));

    let findings = classify(&track("a", Some(5.0)), &evidence);

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].kind, DoctorFindingKind::DamagedPackets);
    assert_eq!(findings[0].skipped_packets, Some(7));
}

/// The tolerance is `max(2 s, 5%)`: tag durations are routinely a second
/// off, and long files earn proportionally more slack.
#[test]
fn the_duration_mismatch_respects_the_tolerance() {
    // 90 s decoded of a claimed 100 s → 10 s off, tolerance 5 s → finding.
    let lying: Examination = Ok((
        summary(48_000 * 90, false, 0),
        profile(Some(-14.0), Some(-2.0)),
    ));
    let findings = classify(&track("a", Some(100.0)), &lying);
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].kind, DoctorFindingKind::DurationMismatch);
    assert_eq!(findings[0].expected_seconds, Some(100.0));
    assert_eq!(findings[0].actual_seconds, Some(90.0));

    // 3,540 s decoded of a claimed 3,600 s → 60 s off, tolerance 180 s → fine.
    let close_enough: Examination = Ok((
        summary(48_000 * 3_540, false, 0),
        profile(Some(-14.0), Some(-2.0)),
    ));
    assert!(classify(&track("a", Some(3_600.0)), &close_enough).is_empty());

    // No claim, no comparison.
    assert!(classify(&track("a", None), &lying).is_empty());
}

#[test]
fn clipping_fires_only_above_full_scale() {
    let clipping: Examination = Ok((summary(240_000, false, 0), profile(Some(-8.0), Some(0.4))));
    let hot_but_legal: Examination =
        Ok((summary(240_000, false, 0), profile(Some(-8.0), Some(-0.1))));

    let findings = classify(&track("a", Some(5.0)), &clipping);
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].kind, DoctorFindingKind::Clipping);
    assert_eq!(findings[0].severity, DoctorSeverity::Info);
    assert_eq!(findings[0].true_peak_db, Some(0.4));

    assert!(classify(&track("a", Some(5.0)), &hot_but_legal).is_empty());
}

#[test]
fn digital_silence_is_informative() {
    let evidence: Examination = Ok((summary(240_000, false, 0), profile(None, None)));

    let findings = classify(&track("a", Some(5.0)), &evidence);

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].kind, DoctorFindingKind::Silent);
    assert_eq!(findings[0].severity, DoctorSeverity::Info);
}

#[test]
fn one_file_can_produce_several_findings() {
    // Damaged and clipping at once.
    let evidence: Examination = Ok((summary(240_000, false, 3), profile(Some(-8.0), Some(0.2))));

    let kinds: Vec<DoctorFindingKind> = classify(&track("a", Some(5.0)), &evidence)
        .into_iter()
        .map(|finding| finding.kind)
        .collect();

    assert_eq!(
        kinds,
        vec![
            DoctorFindingKind::DamagedPackets,
            DoctorFindingKind::Clipping
        ]
    );
}

// ── the wire shapes ──────────────────────────────────────────────────────

#[test]
fn kinds_and_severities_serialize_in_camel_case() {
    let json = |value: serde_json::Value| value;

    assert_eq!(
        json(serde_json::to_value(DoctorFindingKind::MissingFile).expect("serialize")),
        serde_json::json!("missingFile")
    );
    assert_eq!(
        json(serde_json::to_value(DoctorFindingKind::DurationMismatch).expect("serialize")),
        serde_json::json!("durationMismatch")
    );
    assert_eq!(
        json(serde_json::to_value(DoctorSeverity::Warning).expect("serialize")),
        serde_json::json!("warning")
    );
}

#[test]
fn the_result_serializes_with_camel_case_keys() {
    let result = DoctorScanResult {
        scanned: 10,
        healthy: 9,
        cancelled: false,
        findings: vec![DoctorFinding {
            track_id: "t1".to_owned(),
            title: "Track t1".to_owned(),
            file_path: PathBuf::from("/music/t1.mp3"),
            kind: DoctorFindingKind::Truncated,
            severity: DoctorSeverity::Warning,
            expected_seconds: None,
            actual_seconds: None,
            skipped_packets: None,
            true_peak_db: None,
        }],
    };

    let json = serde_json::to_value(&result).expect("serialize");
    assert_eq!(json["scanned"], 10);
    assert_eq!(json["findings"][0]["trackId"], "t1");
    assert_eq!(json["findings"][0]["kind"], "truncated");
    assert_eq!(json["findings"][0]["severity"], "warning");
}
