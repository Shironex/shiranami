//! The F5 loudness surface: full profiles and the album fold.
//!
//! Everything here runs on synthesised WAVs with known amplitudes, so the
//! expected numbers are arithmetic rather than goldens: a stereo sine with peak
//! sample `a` peaks at `20·log10(a / 32768)` dBFS, and a constant tone has a
//! loudness range of nothing. The parity bar for the *integrated* value lives
//! in `addon_parity.rs` and is untouched — these tests pin the additions.

#[path = "support/synth.rs"]
mod synth;

use shiranami_audio::{
    IntegratedLoudness, LoudnessAnalyzer, album_integrated_loudness, decode_file,
    measure_integrated_loudness, measure_loudness_profile,
};
use synth::{SAMPLE_RATE, silence_i16, sine_i16, write_wav_i16};

/// Five seconds — comfortably past the 400 ms gating block and the 3 s
/// short-term window LRA needs.
const FRAMES: usize = SAMPLE_RATE as usize * 5;

fn wav(dir: &tempfile::TempDir, name: &str, interleaved: &[i16]) -> std::path::PathBuf {
    let path = dir.path().join(name);
    write_wav_i16(&path, SAMPLE_RATE, 2, interleaved);
    path
}

/// dBFS of a peak sample value, the number true peak must land near.
fn dbfs(amplitude: i16) -> f64 {
    20.0 * (f64::from(amplitude) / 32768.0).log10()
}

/// `profile()` extends `finish()`; it must never disagree with it about the
/// integrated value, because that is the column the parity bar protects.
#[test]
fn the_profile_carries_the_same_integrated_value_as_finish() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = wav(&dir, "tone.wav", &sine_i16(FRAMES, 997.0, 8_192));

    let finish = measure_integrated_loudness(&path).expect("measure");
    let profile = measure_loudness_profile(&path).expect("profile");

    assert_eq!(profile.integrated, finish);
}

/// A pure sine's true peak sits at its sample amplitude — the 4× oversampler
/// may read a hair above it between samples, never materially below.
#[test]
fn true_peak_of_a_known_sine_reads_at_its_amplitude() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = wav(&dir, "tone.wav", &sine_i16(FRAMES, 997.0, 8_192));

    let profile = measure_loudness_profile(&path).expect("profile");
    let peak = profile.true_peak_db.expect("a tone has a peak");

    let expected = dbfs(8_192);
    assert!(
        (peak - expected).abs() < 0.3,
        "true peak {peak:.3} dBTP should sit near the sample peak {expected:.3} dBFS"
    );
}

/// A constant tone has no loudness range to speak of.
#[test]
fn a_constant_tone_has_a_near_zero_loudness_range() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = wav(&dir, "tone.wav", &sine_i16(FRAMES, 997.0, 8_192));

    let profile = measure_loudness_profile(&path).expect("profile");
    let range = profile.loudness_range.expect("a finite range");

    assert!(range < 0.5, "LRA of a steady tone was {range:.3} LU");
}

/// Digital silence: no LUFS to store, and no peak either — `None`, not
/// `-inf`, mirroring how `Silent` stores no integrated value.
#[test]
fn digital_silence_profiles_with_no_peak_and_no_lufs() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = wav(&dir, "silence.wav", &silence_i16(FRAMES, 2));

    let profile = measure_loudness_profile(&path).expect("profile");

    assert_eq!(profile.integrated, IntegratedLoudness::Silent);
    assert_eq!(profile.true_peak_db, None);
}

/// The album fold gates across the union of both tracks' blocks, so a loud
/// track and a quiet track land strictly between their per-track values —
/// which is the whole point of album mode: the quiet interlude counts, but
/// does not define the record.
#[test]
fn a_loud_and_a_quiet_track_fold_to_an_album_loudness_between_them() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let loud_path = wav(&dir, "loud.wav", &sine_i16(FRAMES, 997.0, 16_384));
    let quiet_path = wav(&dir, "quiet.wav", &sine_i16(FRAMES, 997.0, 8_192));

    let mut loud = LoudnessAnalyzer::new();
    decode_file(&loud_path, &mut loud).expect("decode");
    let mut quiet = LoudnessAnalyzer::new();
    decode_file(&quiet_path, &mut quiet).expect("decode");

    let loud_lufs = loud.finish().expect("finish").lufs().expect("measured");
    let quiet_lufs = quiet.finish().expect("finish").lufs().expect("measured");

    let album = album_integrated_loudness(&[loud, quiet])
        .expect("fold")
        .lufs()
        .expect("measured");

    assert!(
        quiet_lufs < album && album < loud_lufs,
        "album {album:.2} LUFS must sit between quiet {quiet_lufs:.2} and loud {loud_lufs:.2}"
    );
}

/// An album of one track is that track — the fold must not shift a lone value.
#[test]
fn an_album_of_one_track_matches_the_track() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = wav(&dir, "tone.wav", &sine_i16(FRAMES, 997.0, 8_192));

    let mut analyzer = LoudnessAnalyzer::new();
    decode_file(&path, &mut analyzer).expect("decode");
    let track = analyzer.finish().expect("finish").lufs().expect("measured");

    let album = album_integrated_loudness(std::slice::from_ref(&analyzer))
        .expect("fold")
        .lufs()
        .expect("measured");

    assert!(
        (album - track).abs() < 1e-6,
        "album {album} vs track {track}"
    );
}

/// An empty album is a caller bug, reported as analysis failure rather than a
/// bogus number.
#[test]
fn an_empty_album_is_refused() {
    assert!(album_integrated_loudness(&[]).is_err());
}
