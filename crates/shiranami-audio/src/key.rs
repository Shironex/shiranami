//! Musical-key estimation — ported from the addon branch's C++, FFT swapped.
//!
//! The algorithm is `core/key.cpp` from `feat/native-bpm-key-addon`: a
//! chromagram over 4096-sample frames at 50% overlap, each frame Hann-windowed
//! and folded bin-by-bin into 12 pitch classes via MIDI note numbers, then
//! Pearson-correlated against the Krumhansl–Schmuckler major and minor profiles
//! rotated through all 12 tonics. The best of the 24 correlations is the key.
//! `test_key.cpp` ports with it as the parity vectors in this module.
//!
//! The C++ hand-rolled a radix-2 FFT (`core/fft.cpp`); here the transform is
//! [`realfft`] — MIT-licensed, pure Rust, the one dependency architecture §2.9
//! predicted for this rung. Both compute the same unnormalised forward
//! transform with the same `e^(-2πi/N)` convention, and both report bins
//! `0..=N/2` of the real signal's spectrum, so the swap changes the numerics by
//! at most `f64` rounding. The Hann window is the C++'s own — applied over the
//! original frame length before zero-padding — not an addition of the port.
//!
//! Like [`crate::bpm`], the shape changes from whole-buffer to a streaming
//! [`PcmSink`]: frames are downmixed and analysed as they decode, holding at
//! most one FFT frame of mono audio, and the frame sequence is identical to the
//! C++'s pass over the full downmix.
//!
//! # "Unknown" is `None`
//!
//! The C++ returned `detected == false` for silence, audio shorter than one
//! analysis frame, and material with no tonal energy in the chroma range; its
//! service mapped an empty key name to `null`. [`KeyAnalyzer::finish`] returns
//! `Option<KeyEstimate>` — same states, no sentinel.

use std::path::Path;
use std::sync::Arc;

use realfft::num_complex::Complex;
use realfft::{RealFftPlanner, RealToComplex};

use crate::decode::decode_file;
use crate::error::{AudioError, Result};
use crate::sink::{PcmSink, PcmSpec};

/// Pitch classes in an octave.
const PITCH_CLASSES: usize = 12;

/// FFT frame size, in mono samples. 4096 ≈ 93 ms at 44.1 kHz — long enough to
/// resolve adjacent semitones in the bass register.
const FRAME_SIZE: usize = 4096;

/// Hop between analysis frames: 50% overlap smooths the chromagram over time.
const HOP_SIZE: usize = 2048;

/// Krumhansl–Schmuckler tonal-hierarchy profile for major keys. Index 0 is the
/// tonic, 1 a semitone above, … 11 a major-seventh above.
const MAJOR_PROFILE: [f64; PITCH_CLASSES] = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];

/// Krumhansl–Schmuckler profile for minor keys.
const MINOR_PROFILE: [f64; PITCH_CLASSES] = [
    6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

/// Pitch-class names. Index 0 is C because MIDI note mod 12 == 0 is C.
const NOTE_NAMES: [&str; PITCH_CLASSES] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

/// An estimated key, e.g. `"C major"` or `"A minor"`.
///
/// The name format is the C++'s exactly, because rows persisted by the addon
/// branch's dev builds already hold these strings and the two eras must remain
/// comparable in the same column.
#[derive(Debug, Clone, PartialEq)]
pub struct KeyEstimate {
    /// `"<note> major"` or `"<note> minor"`, note names with sharps.
    pub name: String,
    /// The best profile correlation, in `-1..=1`. A global best-effort
    /// estimate: strong on tonal material, weaker on ambiguous or atonal audio.
    pub confidence: f64,
}

/// A [`PcmSink`] that accumulates the chromagram a key is estimated from.
pub struct KeyAnalyzer {
    channels: usize,
    /// Pitch class per FFT bin, `-1` for bins outside the musical range.
    /// Computed once per stream because it depends only on the sample rate.
    bin_to_pitch_class: Vec<i8>,
    fft: Option<Arc<dyn RealToComplex<f64>>>,
    /// Downmixed mono samples not yet consumed by a completed frame.
    pending: Vec<f64>,
    chroma: [f64; PITCH_CLASSES],
    any_energy: bool,
    frames_analysed: usize,
}

impl std::fmt::Debug for KeyAnalyzer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("KeyAnalyzer")
            .field("frames_analysed", &self.frames_analysed)
            .field("pending", &self.pending.len())
            .finish_non_exhaustive()
    }
}

impl Default for KeyAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

impl KeyAnalyzer {
    /// An analyser that has not yet been told the stream format.
    #[must_use]
    pub fn new() -> Self {
        Self {
            channels: 0,
            bin_to_pitch_class: Vec::new(),
            fft: None,
            pending: Vec::new(),
            chroma: [0.0; PITCH_CLASSES],
            any_energy: false,
            frames_analysed: 0,
        }
    }

    /// The key estimate, or `None` when there is none to report — silence,
    /// audio shorter than one analysis frame, or no tonal energy.
    #[must_use]
    pub fn finish(&self) -> Option<KeyEstimate> {
        // Fewer than FRAME_SIZE mono samples ever arrived: the C++'s
        // `mono.size() < kFrameSize` guard, expressed as "no frame completed".
        if self.frames_analysed == 0 || !self.any_energy {
            return None;
        }

        // Best of the 24 rotated profiles, major checked before minor at each
        // tonic and strict `>` throughout — the C++'s tie-breaking exactly.
        let mut best: Option<KeyEstimate> = None;
        let mut best_confidence = -2.0_f64; // below the -1..1 correlation range
        for (tonic, note) in NOTE_NAMES.iter().enumerate() {
            let major = correlate(&self.chroma, &MAJOR_PROFILE, tonic);
            if major > best_confidence {
                best_confidence = major;
                best = Some(KeyEstimate {
                    name: format!("{note} major"),
                    confidence: major,
                });
            }
            let minor = correlate(&self.chroma, &MINOR_PROFILE, tonic);
            if minor > best_confidence {
                best_confidence = minor;
                best = Some(KeyEstimate {
                    name: format!("{note} minor"),
                    confidence: minor,
                });
            }
        }
        best
    }

    /// Run the FFT over one completed frame and fold it into the chromagram.
    fn analyse_frame(&mut self) -> Result<()> {
        let Some(fft) = self.fft.clone() else {
            return Ok(());
        };

        // Hann over the frame, exactly as the C++'s magnitudeSpectrum applied
        // it: 0.5 · (1 − cos(2πi/(L−1))).
        let mut input: Vec<f64> = Vec::with_capacity(FRAME_SIZE);
        #[expect(clippy::cast_precision_loss, reason = "indices are at most 4095")]
        for (i, sample) in self.pending[..FRAME_SIZE].iter().enumerate() {
            let hann =
                0.5 * (1.0 - (std::f64::consts::TAU * i as f64 / (FRAME_SIZE - 1) as f64).cos());
            input.push(sample * hann);
        }

        let mut spectrum = vec![Complex::new(0.0, 0.0); FRAME_SIZE / 2 + 1];
        fft.process(&mut input, &mut spectrum)
            .map_err(|error| AudioError::Analysis {
                reason: format!("the FFT rejected a frame: {error}"),
            })?;

        for (bin, value) in spectrum.iter().enumerate() {
            let pc = self.bin_to_pitch_class[bin];
            if pc >= 0 {
                // `Complex::norm` is a hypot, matching `std::abs(complex)`.
                let magnitude = value.norm();
                #[expect(clippy::cast_sign_loss, reason = "pc >= 0 was just checked")]
                {
                    self.chroma[pc as usize] += magnitude;
                }
                if magnitude > 0.0 {
                    self.any_energy = true;
                }
            }
        }

        self.frames_analysed += 1;
        Ok(())
    }
}

impl PcmSink for KeyAnalyzer {
    fn begin(&mut self, spec: PcmSpec) -> Result<()> {
        self.channels = usize::from(spec.channels);
        self.bin_to_pitch_class = bin_pitch_classes(FRAME_SIZE, f64::from(spec.sample_rate));
        self.fft = Some(RealFftPlanner::<f64>::new().plan_fft_forward(FRAME_SIZE));
        Ok(())
    }

    fn accept(&mut self, interleaved: &[f32]) -> Result<()> {
        if self.channels == 0 {
            return Ok(());
        }

        // Downmix to mono by averaging channels, in f64 as the C++ did.
        #[expect(clippy::cast_precision_loss, reason = "channel counts are tiny")]
        let channels = self.channels as f64;
        self.pending.reserve(interleaved.len() / self.channels);
        for frame in interleaved.chunks_exact(self.channels) {
            let sum: f64 = frame.iter().map(|sample| f64::from(*sample)).sum();
            self.pending.push(sum / channels);
        }

        // Analyse every completed frame, advancing by the hop. The frame
        // sequence — positions 0, 2048, 4096, … over the whole downmix, tail
        // shorter than a frame dropped — is the C++ loop's exactly.
        while self.pending.len() >= FRAME_SIZE {
            self.analyse_frame()?;
            self.pending.drain(..HOP_SIZE);
        }
        Ok(())
    }
}

/// The pitch class of each FFT bin, or `-1` outside the useful musical range.
///
/// Bin `k` is `k·sample_rate/fft_size` Hz, converted to a MIDI note
/// (A4 = 69 = 440 Hz) and taken mod 12. The range restriction — roughly the
/// piano's — keeps sub-bass rumble and ultrasonics out of the chromagram.
fn bin_pitch_classes(fft_size: usize, sample_rate: f64) -> Vec<i8> {
    #[expect(
        clippy::cast_precision_loss,
        reason = "fft sizes are small powers of two"
    )]
    (0..=fft_size / 2)
        .map(|k| {
            if k == 0 {
                return -1; // DC carries no pitch
            }
            let freq = k as f64 * sample_rate / fft_size as f64;
            if !(27.5..=5000.0).contains(&freq) {
                return -1;
            }
            let midi = 69.0 + 12.0 * (freq / 440.0).log2();
            #[expect(
                clippy::cast_possible_truncation,
                reason = "midi numbers in the audible range are far inside i64"
            )]
            let note = midi.round() as i64;
            #[expect(clippy::cast_possible_truncation, reason = "a value mod 12 fits in i8")]
            {
                (note.rem_euclid(12)) as i8
            }
        })
        .collect()
}

/// Pearson correlation between the chromagram and a key profile rotated so its
/// tonic aligns with pitch class `tonic`.
fn correlate(chroma: &[f64; PITCH_CLASSES], profile: &[f64; PITCH_CLASSES], tonic: usize) -> f64 {
    #[expect(clippy::cast_precision_loss, reason = "PITCH_CLASSES is 12")]
    let n = PITCH_CLASSES as f64;
    let mean_c: f64 = chroma.iter().sum::<f64>() / n;
    let mean_p: f64 = profile.iter().sum::<f64>() / n;

    let mut num = 0.0_f64;
    let mut den_c = 0.0_f64;
    let mut den_p = 0.0_f64;
    for i in 0..PITCH_CLASSES {
        let p = profile[(i + PITCH_CLASSES - tonic) % PITCH_CLASSES];
        let dc = chroma[i] - mean_c;
        let dp = p - mean_p;
        num += dc * dp;
        den_c += dc * dc;
        den_p += dp * dp;
    }
    let den = (den_c * den_p).sqrt();
    if den == 0.0 { 0.0 } else { num / den }
}

/// Decode `path` once and estimate its key.
///
/// `Ok(None)` is a successful analysis with nothing to report — the caller
/// persists `NULL`, exactly as the addon's service mapped an empty key.
///
/// # Errors
///
/// Propagates every [`AudioError`] that [`decode_file`] can raise.
pub fn key_from_file(path: &Path) -> Result<Option<KeyEstimate>> {
    let mut analyzer = KeyAnalyzer::new();
    decode_file(path, &mut analyzer)?;
    Ok(analyzer.finish())
}

#[cfg(test)]
mod tests {
    //! The C++ suite (`test_key.cpp`), ported vector for vector, plus the
    //! spectrum sanity check from `test_fft.cpp` and the streaming property.

    use super::*;

    const SAMPLE_RATE: u32 = 44_100;

    /// `synth_audio.hpp`'s `makeChord`: a mono sum of sine tones, normalised.
    fn chord(freqs: &[f64], seconds: f64) -> Vec<f32> {
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "test sizes"
        )]
        let total = (seconds * f64::from(SAMPLE_RATE)) as usize;
        #[expect(clippy::cast_precision_loss, reason = "test sizes")]
        let count = freqs.len() as f64;
        (0..total)
            .map(|n| {
                #[expect(clippy::cast_precision_loss, reason = "test sizes")]
                let t = n as f64 / f64::from(SAMPLE_RATE);
                let acc: f64 = freqs
                    .iter()
                    .map(|f| (std::f64::consts::TAU * f * t).sin())
                    .sum();
                #[expect(clippy::cast_possible_truncation, reason = "normalised to unity")]
                {
                    (acc / count) as f32
                }
            })
            .collect()
    }

    fn detect(samples: &[f32], chunk: usize) -> Option<KeyEstimate> {
        let mut analyzer = KeyAnalyzer::new();
        analyzer
            .begin(PcmSpec {
                channels: 1,
                sample_rate: SAMPLE_RATE,
            })
            .expect("begin");
        for buffer in samples.chunks(chunk) {
            analyzer.accept(buffer).expect("accept");
        }
        analyzer.finish()
    }

    #[test]
    fn a_c_major_triad_reports_c_major() {
        // C4, E4, G4.
        let estimate =
            detect(&chord(&[261.63, 329.63, 392.00], 3.0), 4096).expect("a triad has a key");
        assert_eq!(estimate.name, "C major");
        assert!(estimate.confidence > 0.0);
    }

    #[test]
    fn an_a_minor_triad_reports_a_minor() {
        // A3, C4, E4 — the relative minor; a distinct chord from the C-major
        // case.
        let estimate =
            detect(&chord(&[220.00, 261.63, 329.63], 3.0), 4096).expect("a triad has a key");
        assert_eq!(estimate.name, "A minor");
    }

    #[test]
    fn silence_is_not_detectable() {
        assert_eq!(detect(&vec![0.0; SAMPLE_RATE as usize * 2], 4096), None);
    }

    #[test]
    fn audio_shorter_than_one_analysis_frame_is_not_detectable() {
        assert_eq!(detect(&[0.3; 1_000], 4096), None);
    }

    #[test]
    fn the_estimate_is_independent_of_buffer_chunking() {
        let samples = chord(&[261.63, 329.63, 392.00], 3.0);
        let whole = detect(&samples, samples.len());
        let odd = detect(&samples, 1_237);
        assert_eq!(whole, odd);
    }

    #[test]
    fn a_tone_lands_in_its_expected_pitch_class() {
        // `test_fft.cpp`'s magnitudeSpectrum check, restated at this module's
        // level: a pure A4 (440 Hz) must put pitch class A (9) far above every
        // other before profile correlation even starts.
        let mut analyzer = KeyAnalyzer::new();
        analyzer
            .begin(PcmSpec {
                channels: 1,
                sample_rate: SAMPLE_RATE,
            })
            .expect("begin");
        analyzer.accept(&chord(&[440.0], 1.0)).expect("accept");

        let strongest = analyzer
            .chroma
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(b.1))
            .map(|(pc, _)| pc);
        assert_eq!(strongest, Some(9), "chroma: {:?}", analyzer.chroma);
    }
}
