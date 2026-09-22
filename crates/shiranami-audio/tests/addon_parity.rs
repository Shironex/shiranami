//! Parity with the C++ addon this crate replaces.
//!
//! Phase 5's acceptance bar (architecture, phase table): *"LUFS within ±0.1 LU
//! of the C++ addon on a fixture set; peaks byte-identical for the same
//! buckets."* Both halves are checked here against values produced by the
//! addon's own `core/` — `audio_decoder.cpp` + `peaks.cpp` + `loudness.cpp`
//! compiled with the vendored dr_libs and libebur128 and run over these exact
//! files.
//!
//! # Reproducing the golden values
//!
//! The numbers below are not hand-derived and must not be edited to make a test
//! pass. To regenerate them, build the addon's pure core into a harness — no
//! N-API needed, which is what the `core/` split was for — then emit the
//! synthesised fixtures with
//!
//! ```text
//! SHIRANAMI_PARITY_OUT=<dir> cargo test -p shiranami-audio --test addon_parity \
//!   -- --ignored emit_synthesised_fixtures
//! ```
//!
//! and run the harness over `<dir>` and `tests/fixtures/`.
//!
//! # One tolerance, and what it actually costs
//!
//! Every fixture is held to the same ±0.1 LU, and none of them needs it.
//! `ebur128` is a port of the vendored `libebur128`, so on the lossless
//! fixtures — where symphonia and dr_libs hand the analyser identical samples —
//! the two implementations land **2.1e-14 LU** apart, which is `f64` noise
//! rather than a difference. The mp3 fixture is the only one where the *inputs*
//! differ, because dr_mp3 and symphonia are different decoders that disagree
//! about encoder-delay trimming; even there the measurement moves by
//! **0.0063 LU**, sixteen times inside the bar.
//!
//! That margin is what makes the values safe to leave alone: `tracks.loudness_lufs`
//! rows measured by v1 are carried across and never re-measured, so a v1 row and
//! a v2 row of the same track differ by less than the gain step a listener could
//! detect, let alone one volume leveling would apply differently.

#[path = "support/synth.rs"]
mod synth;

use std::path::Path;

use shiranami_audio::loudness::{IntegratedLoudness, measure_integrated_loudness};
use shiranami_audio::peaks::peaks_from_file;

/// Steps in the synthesised staircase fixture.
const STAIRCASE_STEPS: usize = 7;
/// Frames per step, chosen so no bucket boundary lands on a step edge.
const STAIRCASE_FRAMES_PER_STEP: usize = 143;
/// i16 amplitude of the first step; step `n` sits at `(n + 1)` times this.
const STAIRCASE_STEP: i16 = 1_000;

/// Phase 5's stated bar, in loudness units. Every fixture clears it, lossy
/// included — see the module docs for the measured margins.
const LUFS_TOLERANCE: f64 = 0.1;

/// Addon peaks for `sine.wav` and `sine.flac` at 8 buckets, as raw `f32` bits.
///
/// A 1 s stereo tone held at 290/32768, so every bucket is the same value —
/// which is exactly why the staircase below exists as well.
const SINE_PEAK_BITS: [u32; 8] = [1_007_747_072; 8];

/// Addon peaks for `sine.mp3` at 8 buckets.
const SINE_MP3_PEAK_BITS: [u32; 8] = [
    1_007_321_088,
    1_007_288_320,
    1_007_288_320,
    1_007_288_320,
    1_007_288_320,
    1_007_288_320,
    1_007_288_320,
    1_007_288_320,
];

/// Addon peaks for the synthesised staircase at 8 buckets.
///
/// 1001 frames over 8 buckets is 125.125 frames each, so six of the seven step
/// edges fall inside a bucket rather than on its boundary. Reproducing these
/// bits is what proves the fractional-boundary arithmetic was ported and not
/// merely approximated.
const STAIRCASE_PEAK_BITS: [u32; 8] = [
    1_023_016_960,
    1_031_405_568,
    1_035_698_176,
    1_039_794_176,
    1_042_038_784,
    1_044_086_784,
    1_046_134_784,
    1_046_134_784,
];

/// Addon LUFS for `sine.wav`.
const SINE_WAV_LUFS: f64 = -41.070_942_255_245_036;
/// Addon LUFS for `sine.flac` — the same signal, losslessly encoded.
const SINE_FLAC_LUFS: f64 = -41.070_942_255_245_036;
/// Addon LUFS for `sine.mp3`.
const SINE_MP3_LUFS: f64 = -41.523_534_201_952_46;
/// Addon LUFS for the synthesised 1 kHz tone at −20 dBFS.
const SINE_1K_LUFS: f64 = -19.992_724_445_369_632;

/// Write the synthesised fixtures so the C++ harness can run over the very bytes
/// the tests below synthesise.
///
/// Ignored by default: it produces inputs for a manual parity run rather than
/// asserting anything.
#[test]
#[ignore = "fixture emitter, not an assertion"]
fn emit_synthesised_fixtures() {
    let out = std::env::var("SHIRANAMI_PARITY_OUT")
        .expect("set SHIRANAMI_PARITY_OUT to the directory to write into");
    let out = Path::new(&out);
    std::fs::create_dir_all(out).expect("create the output directory");

    synth::write_wav_i16(
        &out.join("staircase.wav"),
        synth::SAMPLE_RATE,
        2,
        &staircase(),
    );
    synth::write_wav_i16(&out.join("sine-1k.wav"), synth::SAMPLE_RATE, 2, &sine_1k());
    synth::write_wav_i16(
        &out.join("silence.wav"),
        synth::SAMPLE_RATE,
        2,
        &synth::silence_i16(synth::SAMPLE_RATE as usize, 2),
    );
}

fn staircase() -> Vec<i16> {
    synth::staircase_i16(STAIRCASE_STEPS, STAIRCASE_FRAMES_PER_STEP, STAIRCASE_STEP)
}

fn sine_1k() -> Vec<i16> {
    // −20 dBFS: 0.1 × 32768 ≈ 3277.
    synth::sine_i16(synth::SAMPLE_RATE as usize, 1_000.0, 3_277)
}

/// Assert every peak is bit-identical to the addon's.
#[track_caller]
fn assert_peak_bits(actual: &[f32], expected: &[u32]) {
    let bits: Vec<u32> = actual.iter().map(|peak| peak.to_bits()).collect();
    assert_eq!(bits, expected, "peaks differ from the addon's: {actual:?}");
}

#[track_caller]
fn assert_lufs_within(actual: IntegratedLoudness, expected: f64, tolerance: f64) {
    let IntegratedLoudness::Measured(lufs) = actual else {
        panic!("expected a measurement, got {actual:?}");
    };
    let delta = (lufs - expected).abs();
    assert!(
        delta <= tolerance,
        "{lufs} LUFS is {delta} LU from the addon's {expected}"
    );
}

#[test]
fn wav_peaks_are_bit_identical_to_the_addon() {
    let waveform = peaks_from_file(&synth::fixture("sine.wav"), 8).expect("decode sine.wav");

    assert_eq!((waveform.sample_rate, waveform.channels), (48_000, 2));
    assert_peak_bits(&waveform.peaks, &SINE_PEAK_BITS);
}

#[test]
fn flac_peaks_are_bit_identical_to_the_addon() {
    let waveform = peaks_from_file(&synth::fixture("sine.flac"), 8).expect("decode sine.flac");

    assert_peak_bits(&waveform.peaks, &SINE_PEAK_BITS);
}

#[test]
fn staircase_peaks_are_bit_identical_across_fractional_boundaries() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("staircase.wav");
    synth::write_wav_i16(&path, synth::SAMPLE_RATE, 2, &staircase());

    let waveform = peaks_from_file(&path, 8).expect("decode the staircase");

    assert_peak_bits(&waveform.peaks, &STAIRCASE_PEAK_BITS);
}

#[test]
fn mp3_peaks_match_the_addon_to_within_a_decoder_difference() {
    // Not asserted bit-identical: two mp3 decoders, one lossy bitstream. What
    // must hold is that the shape survives — the same tone at the same level,
    // not a waveform drawn from different audio.
    let waveform = peaks_from_file(&synth::fixture("sine.mp3"), 8).expect("decode sine.mp3");

    for (index, (peak, addon_bits)) in waveform.peaks.iter().zip(SINE_MP3_PEAK_BITS).enumerate() {
        let addon = f32::from_bits(addon_bits);
        assert!(
            (peak - addon).abs() < 0.001,
            "bucket {index}: {peak} vs the addon's {addon}"
        );
    }
}

#[test]
fn wav_loudness_is_within_the_phase_bar_of_the_addon() {
    let measured =
        measure_integrated_loudness(&synth::fixture("sine.wav")).expect("measure sine.wav");

    assert_lufs_within(measured, SINE_WAV_LUFS, LUFS_TOLERANCE);
}

#[test]
fn flac_loudness_is_within_the_phase_bar_of_the_addon() {
    let measured =
        measure_integrated_loudness(&synth::fixture("sine.flac")).expect("measure sine.flac");

    assert_lufs_within(measured, SINE_FLAC_LUFS, LUFS_TOLERANCE);
}

#[test]
fn a_synthesised_tone_measures_where_the_addon_measured_it() {
    // A −20 dBFS 1 kHz stereo tone. K-weighting is flat at 1 kHz and the stereo
    // channel sum cancels the sine's −3 dB crest, so ≈ −20 LUFS is also the
    // theoretical answer — the addon and the standard agree here, and so must we.
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("sine-1k.wav");
    synth::write_wav_i16(&path, synth::SAMPLE_RATE, 2, &sine_1k());

    let measured = measure_integrated_loudness(&path).expect("measure the tone");

    assert_lufs_within(measured, SINE_1K_LUFS, LUFS_TOLERANCE);
    assert_lufs_within(measured, -20.0, 0.05);
}

#[test]
fn mp3_loudness_is_within_the_phase_bar_of_the_addon() {
    // The one fixture where the two implementations analyse different samples,
    // and still the only one that needs any of the tolerance at all: 0.0063 LU.
    let measured =
        measure_integrated_loudness(&synth::fixture("sine.mp3")).expect("measure sine.mp3");

    assert_lufs_within(measured, SINE_MP3_LUFS, LUFS_TOLERANCE);
}

#[test]
fn digital_silence_reports_silent_exactly_as_the_addon_did() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("silence.wav");
    synth::write_wav_i16(
        &path,
        synth::SAMPLE_RATE,
        2,
        &synth::silence_i16(synth::SAMPLE_RATE as usize, 2),
    );

    assert_eq!(
        measure_integrated_loudness(&path).expect("measure"),
        IntegratedLoudness::Silent
    );
}

#[test]
fn a_clip_shorter_than_one_gating_block_reports_silent() {
    // The staircase is 1001 frames — 21 ms, well under EBU R128's 400 ms gating
    // block, so integrated loudness is −∞ and there is nothing to store. The
    // addon reported `silent` for it too, and the caller must not persist a
    // number for a track it could not actually measure.
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("staircase.wav");
    synth::write_wav_i16(&path, synth::SAMPLE_RATE, 2, &staircase());

    assert_eq!(
        measure_integrated_loudness(&path).expect("measure"),
        IntegratedLoudness::Silent
    );
}
