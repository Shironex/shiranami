//! The pure-DSP contract of the bucket reducer.
//!
//! Every case from the addon's `test/test_peaks.cpp` is carried over verbatim
//! in intent, plus the edges C++ could not express safely. These assert exact
//! equality rather than an epsilon: the reducer only ever *selects* one of its
//! inputs, so there is no arithmetic for a tolerance to absorb, and an inexact
//! result would mean a real defect.

use shiranami_audio::peaks::{FrameEnvelope, reduce_peaks};

#[test]
fn a_constant_mono_signal_reduces_to_that_constant() {
    let frames = vec![0.5_f32; 8];

    assert_eq!(reduce_peaks(&frames, 1, 4), vec![0.5; 4]);
}

#[test]
fn negative_samples_surface_as_positive_peaks() {
    // Amplitude is symmetric around zero, so a single loud negative sample is
    // still the bucket's peak.
    assert_eq!(reduce_peaks(&[-0.9, 0.1], 1, 1), vec![0.9]);
}

#[test]
fn a_localized_spike_lands_in_its_own_bucket() {
    assert_eq!(
        reduce_peaks(&[0.1, 0.1, 0.8, 0.1], 1, 4),
        vec![0.1, 0.1, 0.8, 0.1]
    );
}

#[test]
fn the_peak_is_the_loudest_across_interleaved_channels() {
    // Two stereo frames: (L 0.2, R 0.7) and (L 0.3, R 0.1). One bucket, so the
    // answer is the loudest of all four samples — no downmix, no averaging.
    assert_eq!(reduce_peaks(&[0.2, 0.7, 0.3, 0.1], 2, 1), vec![0.7]);
}

#[test]
fn more_buckets_than_frames_leaves_the_straddled_buckets_empty() {
    // A v1 quirk, pinned deliberately rather than fixed. With 2 frames over 8
    // buckets the window is 0.25 frames wide, so six of the eight buckets have
    // `start == end` and stay at their initialised zero; a frame only lands in
    // the bucket its window closes on. The addon's own test asserted nothing
    // but "in range", which is how the shape went unnoticed.
    //
    // It never fires in production — 512 buckets against a track means
    // thousands of frames each — and matching v1 exactly is worth more than an
    // arguably nicer answer that would make a re-analysed track's waveform
    // differ from its cached one.
    assert_eq!(
        reduce_peaks(&[0.4, 0.6], 1, 8),
        vec![0.0, 0.0, 0.0, 0.4, 0.0, 0.0, 0.0, 0.6]
    );
}

#[test]
fn fractional_bucket_boundaries_never_drift() {
    // 10 frames over 4 buckets is 2.5 frames per bucket: boundaries fall at
    // 0, 2, 5, 7, 10. An integer cursor advancing by 2 would end at frame 8 and
    // silently drop the last two frames — including the loudest.
    let frames: Vec<f32> = (0..10).map(|f| f as f32 / 10.0).collect();

    assert_eq!(reduce_peaks(&frames, 1, 4), vec![0.1, 0.4, 0.6, 0.9]);
}

#[test]
fn an_empty_signal_reduces_to_zeros_rather_than_to_nothing() {
    // A track that decoded to no frames draws a flat line, not an absent
    // waveform: the renderer expects the bucket count it asked for.
    assert_eq!(reduce_peaks(&[], 2, 3), vec![0.0, 0.0, 0.0]);
}

#[test]
fn zero_channels_contributes_no_frames() {
    assert_eq!(reduce_peaks(&[0.5, 0.5], 0, 2), vec![0.0, 0.0]);
}

#[test]
fn zero_buckets_reduces_to_an_empty_vector() {
    assert!(reduce_peaks(&[0.5, 0.5], 1, 0).is_empty());
}

#[test]
fn a_trailing_partial_frame_is_ignored() {
    // Five samples at two channels is two whole frames and one orphan sample.
    // The orphan cannot be part of a frame, so it cannot be part of a peak.
    assert_eq!(reduce_peaks(&[0.1, 0.2, 0.3, 0.4, 0.9], 2, 1), vec![0.4]);
}

#[test]
fn a_nan_sample_is_ignored_rather_than_poisoning_its_bucket() {
    // C++'s `if (a > peak)` is false for NaN; `f32::max` returns the non-NaN
    // operand. Both drop it, and a NaN reaching the renderer would break the
    // canvas path outright.
    assert_eq!(reduce_peaks(&[0.3, f32::NAN, 0.2], 1, 1), vec![0.3]);
}

#[test]
fn an_envelope_accumulates_across_buffers() {
    // The streaming path must produce exactly what the whole-buffer path does,
    // because only one of them runs in production.
    let mut envelope = FrameEnvelope::new();
    envelope.push_interleaved(&[0.1, 0.2], 2);
    envelope.push_interleaved(&[0.9, 0.4, 0.3, 0.3], 2);

    assert_eq!(envelope.frames(), 3);
    assert_eq!(
        envelope.reduce(3),
        reduce_peaks(&[0.1, 0.2, 0.9, 0.4, 0.3, 0.3], 2, 3)
    );
    assert_eq!(envelope.reduce(3), vec![0.2, 0.9, 0.3]);
}
