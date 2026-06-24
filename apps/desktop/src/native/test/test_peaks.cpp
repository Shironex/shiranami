// Unit tests for core/peaks::reducePeaks — pure DSP, no decoding, no JS.
//
// reducePeaks takes interleaved float frames and reduces them to N bucket
// peaks, where each peak is the loudest ABSOLUTE sample across all channels in
// that bucket's slice (range 0..1). These tests pin that contract.
#include <vector>

#include "core/peaks.hpp"
#include "vendor/doctest/doctest.h"

using shiranami::audio::reducePeaks;

TEST_CASE("reducePeaks: a constant mono signal reduces to that constant") {
  // 8 frames all at 0.5 → every bucket's loudest sample is 0.5.
  std::vector<float> frames(8, 0.5f);
  std::vector<float> out(4, -1.0f);

  reducePeaks(frames.data(), frames.size(), /*channels=*/1, /*buckets=*/4,
              out.data());

  for (float peak : out) {
    CHECK(peak == doctest::Approx(0.5f));
  }
}

TEST_CASE("reducePeaks: takes the absolute value of negative samples") {
  // A single loud negative sample must surface as a positive peak.
  std::vector<float> frames = {-0.9f, 0.1f};
  std::vector<float> out(1, 0.0f);

  reducePeaks(frames.data(), frames.size(), /*channels=*/1, /*buckets=*/1,
              out.data());

  CHECK(out[0] == doctest::Approx(0.9f));
}

TEST_CASE("reducePeaks: a localized spike lands in its own bucket") {
  // 4 mono frames, 4 buckets (1 frame each). Only frame 2 is loud.
  std::vector<float> frames = {0.1f, 0.1f, 0.8f, 0.1f};
  std::vector<float> out(4, 0.0f);

  reducePeaks(frames.data(), frames.size(), /*channels=*/1, /*buckets=*/4,
              out.data());

  CHECK(out[0] == doctest::Approx(0.1f));
  CHECK(out[1] == doctest::Approx(0.1f));
  CHECK(out[2] == doctest::Approx(0.8f));  // the spike
  CHECK(out[3] == doctest::Approx(0.1f));
}

TEST_CASE("reducePeaks: peak is the loudest across interleaved channels") {
  // 2 frames, stereo: frame0 = (L 0.2, R 0.7), frame1 = (L 0.3, R 0.1).
  // One bucket → loudest of all four samples is 0.7.
  std::vector<float> frames = {0.2f, 0.7f, 0.3f, 0.1f};
  std::vector<float> out(1, 0.0f);

  // 4 interleaved samples / 2 channels = 2 frames. Passing the sample count as
  // the frame count would walk the loop past the buffer.
  reducePeaks(frames.data(), frames.size() / 2, /*channels=*/2, /*buckets=*/1,
              out.data());

  CHECK(out[0] == doctest::Approx(0.7f));
}

TEST_CASE("reducePeaks: more buckets than frames stays in range and safe") {
  // Asking for more buckets than frames must not read out of bounds or write
  // garbage — every output stays within 0..1.
  std::vector<float> frames = {0.4f, 0.6f};
  std::vector<float> out(8, -1.0f);

  reducePeaks(frames.data(), frames.size(), /*channels=*/1, /*buckets=*/8,
              out.data());

  for (float peak : out) {
    CHECK(peak >= 0.0f);
    CHECK(peak <= 1.0f);
  }
}
