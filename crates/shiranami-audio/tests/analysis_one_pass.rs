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
use shiranami_audio::{FanOutSink, PcmSink, PcmSpec, decode_file};

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
