// Unit tests for core/fft — the hand-rolled radix-2 FFT and its real-signal
// magnitude-spectrum wrapper. No decoding, no JS. These pin the transform
// against signals with known spectra so a regression in the butterfly math or
// bit-reversal surfaces immediately.
#include <cmath>
#include <complex>
#include <vector>

#include "core/fft.hpp"
#include "vendor/doctest/doctest.h"

using shiranami::audio::fft;
using shiranami::audio::magnitudeSpectrum;

TEST_CASE("fft: a DC signal concentrates all energy in bin 0") {
  // Constant input → only the zero-frequency bin is non-zero, equal to the sum.
  std::vector<std::complex<double>> data(8, std::complex<double>(1.0, 0.0));
  fft(data);
  CHECK(data[0].real() == doctest::Approx(8.0));
  CHECK(std::abs(data[0].imag()) == doctest::Approx(0.0).epsilon(1e-9));
  for (std::size_t k = 1; k < data.size(); ++k) {
    CHECK(std::abs(data[k]) == doctest::Approx(0.0).epsilon(1e-9));
  }
}

TEST_CASE("fft: a cosine at bin 2 peaks at bins 2 and N-2") {
  // x[n] = cos(2π·2·n/8). A real cosine at bin b shows up at bins b and N-b,
  // each with magnitude N/2.
  const std::size_t n = 8;
  std::vector<std::complex<double>> data(n);
  for (std::size_t i = 0; i < n; ++i) {
    data[i] = std::complex<double>(
        std::cos(2.0 * M_PI * 2.0 * static_cast<double>(i) /
                 static_cast<double>(n)),
        0.0);
  }
  fft(data);
  CHECK(std::abs(data[2]) == doctest::Approx(4.0).epsilon(1e-6));
  CHECK(std::abs(data[6]) == doctest::Approx(4.0).epsilon(1e-6));
  CHECK(std::abs(data[1]) == doctest::Approx(0.0).epsilon(1e-6));
  CHECK(std::abs(data[3]) == doctest::Approx(0.0).epsilon(1e-6));
}

TEST_CASE("fft: length 0 or 1 is its own transform (no-op)") {
  std::vector<std::complex<double>> empty;
  fft(empty);  // must not crash
  CHECK(empty.empty());

  std::vector<std::complex<double>> one(1, std::complex<double>(3.0, 0.0));
  fft(one);
  CHECK(one[0].real() == doctest::Approx(3.0));
}

TEST_CASE("magnitudeSpectrum: a tone lands in its expected bin") {
  // Build a frame of a sine whose frequency is exactly bin 8 of a 256-point
  // FFT, then assert the windowed magnitude spectrum peaks at bin 8.
  const std::size_t fftSize = 256;
  const std::size_t targetBin = 8;
  std::vector<double> frame(fftSize);
  for (std::size_t i = 0; i < fftSize; ++i) {
    frame[i] = std::sin(2.0 * M_PI * static_cast<double>(targetBin) *
                        static_cast<double>(i) / static_cast<double>(fftSize));
  }

  const std::vector<double> mags = magnitudeSpectrum(frame);
  REQUIRE(mags.size() == fftSize / 2 + 1);

  std::size_t argmax = 0;
  for (std::size_t k = 1; k < mags.size(); ++k) {
    if (mags[k] > mags[argmax]) argmax = k;
  }
  CHECK(argmax == targetBin);
}

TEST_CASE("magnitudeSpectrum: an empty frame yields an empty spectrum") {
  CHECK(magnitudeSpectrum({}).empty());
}
