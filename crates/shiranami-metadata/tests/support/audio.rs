//! Audio fixtures for the tag tests.
//!
//! `#[path]`-included rather than reached through a `tests/support/mod.rs`,
//! because `mod.rs` is a manifest in this workspace and this file is anything
//! but. Same arrangement as `shiranami-audio`'s `synth.rs`.

#![allow(dead_code, reason = "each test file uses a different subset")]

use std::fs;
use std::path::{Path, PathBuf};

/// The four committed containers, and the tag each one natively carries.
///
/// Copied from `shiranami-audio/tests/fixtures/` rather than re-encoded, so
/// both crates are testing the same bytes. WAV is synthesised instead of
/// committed — see [`wav`] — because a WAV of usable length is an order of
/// magnitude larger than the compressed formats.
pub(crate) const CONTAINERS: &[(&str, &str)] = &[
    ("sine.mp3", "ID3v2"),
    ("sine.flac", "Vorbis comments"),
    ("sine.m4a", "MP4 ilst"),
    ("sine.ogg", "Vorbis comments"),
];

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

/// Copy a committed fixture into `directory` so a test can write to it.
///
/// Every tag test mutates its input, so nothing may touch the committed file.
pub(crate) fn scratch(directory: &Path, name: &str) -> PathBuf {
    let destination = directory.join(name);
    fs::copy(fixtures().join(name), &destination)
        .unwrap_or_else(|error| panic!("could not stage {name}: {error}"));
    destination
}

/// Write a minimal but valid PCM WAV into `directory`.
///
/// Synthesised rather than committed: WAV is uncompressed, so even a fraction
/// of a second dwarfs the four compressed fixtures put together. The contents
/// are irrelevant — these tests care about the tag chunk, not the audio.
pub(crate) fn wav(directory: &Path, name: &str) -> PathBuf {
    const SAMPLE_RATE: u32 = 44_100;
    const CHANNELS: u16 = 1;
    const BITS: u16 = 16;
    const FRAMES: u32 = SAMPLE_RATE / 10;

    let data_len = FRAMES * u32::from(CHANNELS) * u32::from(BITS / 8);
    let byte_rate = SAMPLE_RATE * u32::from(CHANNELS) * u32::from(BITS / 8);
    let block_align = CHANNELS * (BITS / 8);

    let mut bytes = Vec::with_capacity(44 + data_len as usize);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
    bytes.extend_from_slice(&CHANNELS.to_le_bytes());
    bytes.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    bytes.extend_from_slice(&byte_rate.to_le_bytes());
    bytes.extend_from_slice(&block_align.to_le_bytes());
    bytes.extend_from_slice(&BITS.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());

    for frame in 0..FRAMES {
        let phase = f64::from(frame) / f64::from(SAMPLE_RATE) * 440.0 * std::f64::consts::TAU;
        #[expect(clippy::cast_possible_truncation, reason = "bounded by the amplitude")]
        let sample = (phase.sin() * 8000.0) as i16;
        bytes.extend_from_slice(&sample.to_le_bytes());
    }

    let path = directory.join(name);
    fs::write(&path, &bytes).expect("the synthesised WAV writes");
    path
}

/// A tiny but structurally valid JPEG, for cover-embedding tests.
pub(crate) fn jpeg_cover() -> Vec<u8> {
    let mut buffer = image::RgbImage::new(8, 8);
    for (x, y, pixel) in buffer.enumerate_pixels_mut() {
        #[expect(clippy::cast_possible_truncation, reason = "bounded by the image size")]
        let value = ((x * 16 + y * 8) % 256) as u8;
        *pixel = image::Rgb([value, 128, 255 - value]);
    }

    let mut bytes = Vec::new();
    image::DynamicImage::ImageRgb8(buffer)
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Jpeg,
        )
        .expect("an in-memory JPEG encodes");
    bytes
}
