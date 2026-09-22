//! The one-pass engine against the separate paths it replaces.
//!
//! The claim `analysis::FanOutSink` makes is not "roughly the same numbers" —
//! it is that every analyser behind the fan-out observes **exactly** the stream
//! it would have observed alone, so the results are interchangeable with the
//! ones the separate entry points produce. Peaks are compared bit for bit and
//! LUFS by exact `f64` equality: same decoder, same buffers, same order, so any
//! difference at all means the fan-out changed what a sink saw.
//!
//! This is the compatibility bar for replacing v1-shaped per-measurement
//! decodes: `waveform-peaks/` cache entries and `tracks.loudness_lufs` rows
//! written from a one-pass run must be indistinguishable from ones written by
//! the paths the tests below compare against.

#[path = "support/synth.rs"]
mod synth;

use std::path::Path;

use shiranami_audio::loudness::{
    IntegratedLoudness, LoudnessAnalyzer, measure_integrated_loudness,
};
use shiranami_audio::peaks::{PeakAccumulator, peaks_from_file};
use shiranami_audio::{
    AnalyzeRequest, FanOutSink, PcmSink, PcmSpec, analyze_file, bpm_from_file, decode_file,
    key_from_file,
};

/// One decode through the fan-out, then each analyser finished on its own.
fn one_pass(path: &Path, buckets: usize) -> (Vec<f32>, IntegratedLoudness) {
    let mut peaks = PeakAccumulator::new();
    let mut loudness = LoudnessAnalyzer::new();

    let mut fan_out = FanOutSink::new(vec![&mut peaks, &mut loudness]);
    decode_file(path, &mut fan_out).expect("the one-pass decode must succeed");

    (
        peaks.envelope().reduce(buckets),
        loudness.finish().expect("loudness must have seen frames"),
    )
}

#[track_caller]
fn assert_matches_the_separate_paths(path: &Path) {
    let (peaks, loudness) = one_pass(path, 8);

    let separate_peaks = peaks_from_file(path, 8).expect("the peaks path must decode");
    let separate_loudness =
        measure_integrated_loudness(path).expect("the loudness path must decode");

    let bits: Vec<u32> = peaks.iter().map(|peak| peak.to_bits()).collect();
    let separate_bits: Vec<u32> = separate_peaks
        .peaks
        .iter()
        .map(|peak| peak.to_bits())
        .collect();
    assert_eq!(
        bits, separate_bits,
        "one-pass peaks differ from peaks_from_file's"
    );

    // Exact equality, not a tolerance: both paths run the same decoder and the
    // same analyser over the same buffers in the same order. A tolerance here
    // would hide the only failure mode this test exists to catch.
    assert_eq!(
        loudness, separate_loudness,
        "one-pass loudness differs from measure_integrated_loudness's"
    );
}

#[test]
fn wav_one_pass_matches_the_separate_paths() {
    assert_matches_the_separate_paths(&synth::fixture("sine.wav"));
}

#[test]
fn flac_one_pass_matches_the_separate_paths() {
    assert_matches_the_separate_paths(&synth::fixture("sine.flac"));
}

#[test]
fn mp3_one_pass_matches_the_separate_paths() {
    // Lossy, but both sides decode with the same symphonia — so still exact.
    assert_matches_the_separate_paths(&synth::fixture("sine.mp3"));
}

#[test]
fn m4a_one_pass_matches_the_separate_paths() {
    assert_matches_the_separate_paths(&synth::fixture("sine.m4a"));
}

#[test]
fn a_staircase_with_fractional_bucket_boundaries_survives_the_fan_out() {
    // The addon-parity staircase: the fixture whose peak reduction exercises
    // fractional bucket boundaries. If the fan-out re-chunked buffers, this is
    // where it would show.
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("staircase.wav");
    synth::write_wav_i16(
        &path,
        synth::SAMPLE_RATE,
        2,
        &synth::staircase_i16(7, 143, 1_000),
    );

    let (peaks, loudness) = one_pass(&path, 8);
    let separate = peaks_from_file(&path, 8).expect("decode the staircase");

    assert_eq!(
        peaks.iter().map(|p| p.to_bits()).collect::<Vec<_>>(),
        separate
            .peaks
            .iter()
            .map(|p| p.to_bits())
            .collect::<Vec<_>>(),
    );
    // 21 ms is under one EBU R128 gating block; the one-pass run must report
    // the same "nothing to measure" the separate path does.
    assert_eq!(loudness, IntegratedLoudness::Silent);
}

#[test]
fn digital_silence_stays_silent_through_the_fan_out() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("silence.wav");
    synth::write_wav_i16(
        &path,
        synth::SAMPLE_RATE,
        2,
        &synth::silence_i16(synth::SAMPLE_RATE as usize, 2),
    );

    let (peaks, loudness) = one_pass(&path, 8);

    assert_eq!(loudness, IntegratedLoudness::Silent);
    assert!(peaks.iter().all(|peak| *peak == 0.0));
}

#[test]
fn the_first_sink_to_refuse_aborts_the_decode() {
    struct Refuses;
    impl PcmSink for Refuses {
        fn begin(&mut self, _: PcmSpec) -> shiranami_audio::Result<()> {
            Err(shiranami_audio::AudioError::BadRequest("no".to_owned()))
        }
        fn accept(&mut self, _: &[f32]) -> shiranami_audio::Result<()> {
            unreachable!("begin already refused")
        }
    }

    let mut fine = PeakAccumulator::new();
    let mut refuses = Refuses;
    let mut fan_out = FanOutSink::new(vec![&mut fine, &mut refuses]);

    let error = decode_file(&synth::fixture("sine.wav"), &mut fan_out)
        .expect_err("the refusal must surface");
    assert!(
        matches!(error, shiranami_audio::AudioError::BadRequest(_)),
        "{error:?}"
    );
}

#[test]
fn an_empty_fan_out_is_a_valid_if_pointless_sink() {
    // Degenerate but legal: the decode itself still summarises the stream.
    let mut fan_out = FanOutSink::new(Vec::new());
    let summary =
        decode_file(&synth::fixture("sine.wav"), &mut fan_out).expect("decode with no analysers");
    assert_eq!(summary.frames, 48_000);
}

// ── analyze_file: the everything-from-one-decode entry point ─────────────────

/// A mono 44.1 kHz signal with both a beat and a tonal centre: a C-major triad
/// under a 120 BPM click, so all four analysers have something real to measure.
fn musical_wav(path: &Path) {
    const RATE: u32 = 44_100;
    let total = RATE as usize * 8;
    let period = RATE as usize / 2; // 120 BPM
    let burst = RATE as usize / 20;

    let samples: Vec<i16> = (0..total)
        .map(|n| {
            let t = n as f64 / f64::from(RATE);
            // C4 + E4 + G4 at a modest level.
            let triad: f64 = [261.63, 329.63, 392.00]
                .iter()
                .map(|f| (std::f64::consts::TAU * f * t).sin())
                .sum::<f64>()
                / 3.0;
            let click = if n % period < burst { 0.6 } else { 0.0 };
            ((triad * 0.25 + click) * 32_000.0).clamp(-32_768.0, 32_767.0) as i16
        })
        .collect();
    synth::write_wav_i16(path, RATE, 1, &samples);
}

#[test]
fn analyze_file_matches_every_separate_path() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("musical.wav");
    musical_wav(&path);

    let analysis = analyze_file(&path, AnalyzeRequest::everything(8)).expect("one-pass analysis");

    let separate_peaks = peaks_from_file(&path, 8).expect("peaks path");
    let separate_loudness = measure_integrated_loudness(&path).expect("loudness path");
    let separate_bpm = bpm_from_file(&path).expect("bpm path");
    let separate_key = key_from_file(&path).expect("key path");

    // Exact equality across all four: same decoder, same buffers, same order.
    assert_eq!(
        analysis.peaks.as_ref().map(|p| &p.peaks),
        Some(&separate_peaks.peaks)
    );
    assert_eq!(analysis.loudness, Some(separate_loudness));
    assert_eq!(analysis.bpm, separate_bpm);
    assert_eq!(analysis.key, separate_key);

    // And the measurements themselves are what the signal encodes.
    let bpm = analysis.bpm.expect("a click track has a tempo");
    assert!((bpm - 120.0).abs() <= 6.0, "estimated {bpm} BPM");
    assert_eq!(analysis.key.expect("a triad has a key").name, "C major");
}

#[test]
fn a_partial_request_measures_only_what_it_asked_for() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("musical.wav");
    musical_wav(&path);

    let analysis = analyze_file(
        &path,
        AnalyzeRequest {
            peak_buckets: None,
            loudness: false,
            tempo: true,
            key: false,
        },
    )
    .expect("tempo-only analysis");

    assert!(analysis.peaks.is_none());
    assert!(analysis.loudness.is_none());
    assert!(analysis.key.is_none());
    assert_eq!(analysis.bpm, bpm_from_file(&path).expect("bpm path"));
}

#[test]
fn a_request_that_measures_nothing_is_refused() {
    let request = AnalyzeRequest {
        peak_buckets: None,
        loudness: false,
        tempo: false,
        key: false,
    };
    assert!(request.is_empty());

    let error = analyze_file(&synth::fixture("sine.wav"), request)
        .expect_err("an empty request must be refused before decoding");
    assert!(
        matches!(error, shiranami_audio::AudioError::BadRequest(_)),
        "{error:?}"
    );
}

#[test]
fn zero_peak_buckets_is_refused_exactly_as_peaks_from_file_refuses_it() {
    let error = analyze_file(&synth::fixture("sine.wav"), AnalyzeRequest::everything(0))
        .expect_err("zero buckets must be refused");
    assert!(
        matches!(error, shiranami_audio::AudioError::BadRequest(_)),
        "{error:?}"
    );
}
