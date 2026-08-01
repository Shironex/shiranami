//! Shared test support: committed fixture paths and synthesised WAV files.
//!
//! Two kinds of fixture, on purpose.
//!
//! **Committed** — `sine.wav`, `sine.flac`, `sine.mp3`, `sine.m4a` are the very
//! files `apps/desktop/src/native/test/fixtures/` used to validate the C++
//! addon. Copying them rather than re-encoding is what makes the parity numbers
//! in `addon_parity.rs` a comparison of two implementations on identical bytes
//! rather than two implementations on two encodes.
//!
//! **Synthesised** — everything else is written here at test time from pure
//! Rust. No `ffmpeg`, no network, no encoder crate: a 16-bit PCM WAV is a
//! 44-byte header and little-endian samples, so CI needs nothing installed and
//! the bytes are identical on every machine.

#![allow(dead_code)] // each `tests/*.rs` is its own crate and uses a subset.

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};

/// Sample rate every synthesised fixture uses, matching the committed ones.
pub(crate) const SAMPLE_RATE: u32 = 48_000;

/// Absolute path of a committed fixture.
pub(crate) fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

/// Write interleaved 16-bit samples as a canonical PCM WAV.
///
/// # Panics
///
/// If the file cannot be written — a test that cannot stage its input has
/// nothing to assert.
pub(crate) fn write_wav_i16(path: &Path, sample_rate: u32, channels: u16, interleaved: &[i16]) {
    let bits = 16_u16;
    let block_align = channels * bits / 8;
    let byte_rate = sample_rate * u32::from(block_align);
    let data_len = u32::try_from(interleaved.len() * 2).expect("fixture fits in a u32");

    let mut out = Vec::with_capacity(44 + interleaved.len() * 2);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16_u32.to_le_bytes()); // PCM fmt chunk size
    out.extend_from_slice(&1_u16.to_le_bytes()); // WAVE_FORMAT_PCM
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&bits.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for sample in interleaved {
        out.extend_from_slice(&sample.to_le_bytes());
    }

    let mut file = fs::File::create(path).expect("create the wav fixture");
    file.write_all(&out).expect("write the wav fixture");
}

/// A stereo sine at `freq` Hz whose peak sample is `amplitude` (in i16 units).
///
/// Both channels carry the same signal, so the channel-max the reducer takes is
/// unambiguous and the EBU R128 value is the straightforward stereo one.
pub(crate) fn sine_i16(frames: usize, freq: f64, amplitude: i16) -> Vec<i16> {
    let mut samples = Vec::with_capacity(frames * 2);
    for frame in 0..frames {
        let phase = std::f64::consts::TAU * freq * frame as f64 / f64::from(SAMPLE_RATE);
        let value = (phase.sin() * f64::from(amplitude)).round() as i16;
        samples.push(value);
        samples.push(value);
    }
    samples
}

/// A stereo staircase: `steps` blocks of `frames_per_step` frames, block `n`
/// held at `(n + 1) * step_amplitude`, with the right channel inverted and
/// halved.
///
/// Deliberately shaped to make bucket boundaries visible. A constant sine
/// reduces to the same number in every bucket, which proves nothing about where
/// the boundaries fell; a staircase reduced to a bucket count that does *not*
/// divide the frame count evenly does — every bucket that straddles a step edge
/// must take the louder side, and only the fractional-boundary arithmetic gets
/// that right.
pub(crate) fn staircase_i16(steps: usize, frames_per_step: usize, step_amplitude: i16) -> Vec<i16> {
    let mut samples = Vec::with_capacity(steps * frames_per_step * 2);
    for step in 0..steps {
        let level = step_amplitude.saturating_mul(i16::try_from(step + 1).unwrap_or(i16::MAX));
        for _ in 0..frames_per_step {
            samples.push(level);
            samples.push(-(level / 2));
        }
    }
    samples
}

/// Digital silence: every sample exactly zero.
pub(crate) fn silence_i16(frames: usize, channels: u16) -> Vec<i16> {
    vec![0; frames * usize::from(channels)]
}
