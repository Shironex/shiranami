#include "core/fft.hpp"

#include <cmath>  // std::cos, M_PI

namespace shiranami::audio {

namespace {

/** Smallest power of two >= n (n >= 1). Used to pad a frame up to a legal FFT
 *  length. e.g. 3000 -> 4096. */
std::size_t nextPowerOfTwo(std::size_t n) {
  std::size_t p = 1;
  while (p < n) p <<= 1;
  return p;
}

}  // namespace

// Iterative radix-2 Cooley–Tukey FFT. Two phases:
//
//   1. Bit-reversal permutation. The recursive FFT splits the input into
//      even/odd indices repeatedly; doing that iteratively means first
//      reordering the array so each element sits where the recursion would have
//      left it. The destination index is the bit-reversal of the source index
//      (for N=8: 001 -> 100, 011 -> 110, …).
//
//   2. log2(N) butterfly stages. Stage `len` combines pairs of sub-transforms
//      of size len/2 into transforms of size len, multiplying the odd half by a
//      "twiddle factor" w = e^(-2πi/len) raised to successive powers. After the
//      last stage (len == N) the whole array is the transform.
void fft(std::vector<std::complex<double>>& data) {
  const std::size_t n = data.size();
  if (n < 2) return;  // length 0 or 1 is its own transform

  // --- Phase 1: bit-reversal permutation ------------------------------------
  for (std::size_t i = 1, j = 0; i < n; ++i) {
    // Increment j as the bit-reversed counterpart of i.
    std::size_t bit = n >> 1;
    for (; (j & bit) != 0; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) std::swap(data[i], data[j]);
  }

  // --- Phase 2: butterfly stages --------------------------------------------
  for (std::size_t len = 2; len <= n; len <<= 1) {
    // Twiddle base for this stage: w = e^(-2πi/len). The negative sign is the
    // forward-transform convention.
    const double angle = -2.0 * M_PI / static_cast<double>(len);
    const std::complex<double> wlen(std::cos(angle), std::sin(angle));
    for (std::size_t start = 0; start < n; start += len) {
      std::complex<double> w(1.0, 0.0);  // w = wlen^0, then ^1, ^2, …
      for (std::size_t k = 0; k < len / 2; ++k) {
        const std::complex<double> even = data[start + k];
        const std::complex<double> odd = data[start + k + len / 2] * w;
        data[start + k] = even + odd;
        data[start + k + len / 2] = even - odd;
        w *= wlen;
      }
    }
  }
}

std::vector<double> magnitudeSpectrum(const std::vector<double>& frame) {
  if (frame.empty()) return {};

  const std::size_t n = nextPowerOfTwo(frame.size());
  std::vector<std::complex<double>> buf(n, std::complex<double>(0.0, 0.0));

  // Copy the real frame in, applying a Hann window over the ORIGINAL frame
  // length (the zero-padding tail stays zero). Hann: 0.5·(1 − cos(2πi/(L−1))).
  const std::size_t len = frame.size();
  for (std::size_t i = 0; i < len; ++i) {
    const double hann =
        len > 1 ? 0.5 * (1.0 - std::cos(2.0 * M_PI * static_cast<double>(i) /
                                        static_cast<double>(len - 1)))
                : 1.0;
    buf[i] = std::complex<double>(frame[i] * hann, 0.0);
  }

  fft(buf);

  // Bins 0..N/2 carry the unique spectrum of a real signal; the rest mirror it.
  std::vector<double> mags(n / 2 + 1);
  for (std::size_t k = 0; k < mags.size(); ++k) {
    mags[k] = std::abs(buf[k]);
  }
  return mags;
}

}  // namespace shiranami::audio
