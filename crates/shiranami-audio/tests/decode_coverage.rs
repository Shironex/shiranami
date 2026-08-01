//! Which of v1's accepted extensions this crate can actually analyse.
//!
//! `AUDIO_EXTENSIONS` in `apps/desktop/src/main/shared/media-types.ts` is what
//! the v1 library scanner accepts and the v1 audio protocol will serve:
//! `.mp3 .flac .wav .ogg .aac .m4a .opus .wma .weba .webm`. The native addon
//! decoded three of them. Everything else reached the waveform pipeline as a
//! `null` — a flat seekbar, and no cache entry, so it re-attempted on every
//! play — and the loudness pipeline as `undecodable`, which spawned ffmpeg.
//!
//! These tests are the ledger of what changed, in both directions. The
//! gap-asserting cases are as load-bearing as the coverage-asserting ones: they
//! are the evidence behind "Opus and WMA are the residual gap", and they will
//! fail the day a symphonia release closes it — which is the moment to delete
//! them and the caveat in the crate docs together.

#[path = "support/synth.rs"]
mod synth;

use shiranami_audio::error::AudioError;
use shiranami_audio::peaks::peaks_from_file;

/// Decode a fixture to 4 buckets and return the analysis.
fn analyse(name: &str) -> Result<shiranami_audio::WaveformPeaks, AudioError> {
    peaks_from_file(&synth::fixture(name), 4)
}

/// Every fixture is the same 1 s 48 kHz stereo tone, so one shape fits all.
#[track_caller]
fn assert_decodes_the_tone(name: &str) {
    let waveform = analyse(name).unwrap_or_else(|error| panic!("{name}: {error}"));

    assert_eq!(waveform.channels, 2, "{name}");
    assert_eq!(waveform.sample_rate, 48_000, "{name}");
    assert!(
        (waveform.duration_secs - 1.0).abs() < 0.05,
        "{name}: {}",
        waveform.duration_secs
    );
    assert!(
        waveform.peaks.iter().all(|peak| *peak > 0.0),
        "{name}: silent peaks"
    );
}

#[test]
fn the_three_formats_the_addon_decoded_still_decode() {
    for name in ["sine.wav", "sine.flac", "sine.mp3"] {
        assert_decodes_the_tone(name);
    }
}

#[test]
fn m4a_decodes_where_the_addon_gave_up() {
    // This is `undecodable.m4a` from the addon's own fixture set, renamed. Its
    // C++ test asserted `LoudnessStatus::Undecodable` — the fixture existed to
    // pin the *failure*. Here it is simply a file.
    assert_decodes_the_tone("sine.m4a");
}

#[test]
fn ogg_vorbis_decodes_where_the_addon_gave_up() {
    assert_decodes_the_tone("sine.ogg");
}

#[test]
fn opus_is_the_first_of_two_remaining_gaps() {
    // symphonia has no Opus decoder. The container parses, the track is found,
    // and the codec registry has nothing to hand back — so this surfaces as a
    // coverage gap rather than as a corrupt file, which is the distinction the
    // error taxonomy exists to make.
    let error = analyse("sine.opus").expect_err("symphonia gained an Opus decoder");

    assert!(
        matches!(error, AudioError::UnsupportedCodec { .. }),
        "expected an unsupported-codec error, got {error:?}"
    );
}

#[test]
fn wma_is_the_second_of_two_remaining_gaps() {
    // No WMA decoder and no ASF demuxer, so this one fails a step earlier — at
    // the probe. Either way the caller learns the file cannot be analysed.
    let error = analyse("sine.wma").expect_err("symphonia gained WMA support");

    assert!(
        matches!(
            error,
            AudioError::Decode { .. } | AudioError::UnsupportedCodec { .. }
        ),
        "expected a decode or unsupported-codec error, got {error:?}"
    );
}

#[test]
fn a_mislabelled_extension_still_decodes() {
    // The addon dispatched on the extension alone, so a FLAC named `.mp3` was
    // undecodable. Probing the bytes makes the extension a hint, and users do
    // rename files.
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("actually-a-flac.mp3");
    std::fs::copy(synth::fixture("sine.flac"), &path).expect("stage the fixture");

    let waveform = peaks_from_file(&path, 4).expect("decode a mislabelled flac");

    assert_eq!(waveform.channels, 2);
}

#[test]
fn a_missing_file_is_an_io_error() {
    let error = analyse("no-such-file.wav").expect_err("a missing file cannot decode");

    assert!(matches!(error, AudioError::Io { .. }), "{error:?}");
}

#[test]
fn a_file_that_is_not_audio_is_a_decode_error() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("not-audio.wav");
    std::fs::write(&path, b"this is not a media container").expect("stage");

    let error = peaks_from_file(&path, 4).expect_err("text is not audio");

    assert!(matches!(error, AudioError::Decode { .. }), "{error:?}");
}

#[test]
fn zero_buckets_is_rejected_as_a_bad_request() {
    // The addon threw a `RangeError` for the same input.
    let error = peaks_from_file(&synth::fixture("sine.wav"), 0).expect_err("zero buckets");

    assert!(matches!(error, AudioError::BadRequest(_)), "{error:?}");
}

#[test]
fn the_default_bucket_count_is_v1s_frozen_contract() {
    let waveform = peaks_from_file(
        &synth::fixture("sine.wav"),
        shiranami_audio::WAVEFORM_PEAK_COUNT,
    )
    .expect("decode at the contract bucket count");

    assert_eq!(waveform.peaks.len(), 512);
}
