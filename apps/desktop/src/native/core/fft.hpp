// Pure C++ Fast Fourier Transform — no N-API, no third-party library.
//
// The key-detection addon (core/key) needs a frequency-domain view of the
// audio: which musical pitches are present and how strong. That means a Fourier
// transform. Rather than vendor a DSP library, we hand-roll the classic
// iterative radix-2 Cooley–Tukey FFT here — it's ~40 lines, it's the canonical
// "learn how an FFT works" algorithm, and it keeps the native tree dependency-
// free (the BPM path, core/tempo, needs no FFT at all).
//
// "Radix-2" means the input length MUST be a power of two (256, 512, 1024, …).
// Callers zero-pad their frame up to the next power of two before calling.
#pragma once

#include <complex>
#include <vector>

namespace shiranami::audio {

/**
 * In-place forward FFT of `data`, whose length MUST be a power of two.
 *
 * On return, `data[k]` holds the complex amplitude of frequency bin k. Bin k
 * corresponds to frequency `k * sampleRate / N` Hz, for k in [0, N/2] (bins
 * above N/2 are the mirror image of the real input and are ignored by callers).
 *
 * "Forward" = analysis transform (time → frequency), using the e^(-2πi·kn/N)
 * convention. Pure function on its buffer; never throws.
 */
void fft(std::vector<std::complex<double>>& data);

/**
 * Convenience wrapper for real audio: window a real frame, zero-pad it to the
 * next power of two, run the FFT, and return the magnitude (|amplitude|) of
 * bins 0..N/2. A Hann window is applied first to reduce spectral leakage so a
 * pure tone lands in one bin instead of smearing across neighbours.
 *
 * Returns an empty vector when `frame` is empty.
 */
std::vector<double> magnitudeSpectrum(const std::vector<double>& frame);

}  // namespace shiranami::audio
