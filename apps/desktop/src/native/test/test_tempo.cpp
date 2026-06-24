// Unit tests for core/tempo::estimateBpm — pure DSP, no decoding, no JS.
//
// We synthesise click tracks at known tempos in memory (synth_audio.hpp) and
// assert the autocorrelation estimator recovers them, plus the "no beat" and
// "too short" guards that map to 0.0 (unknown) for the caller.
#include "core/tempo.hpp"
#include "test/synth_audio.hpp"
#include "vendor/doctest/doctest.h"

using shiranami::audio::estimateBpm;
using shiranami::test::makeClickTrack;
using shiranami::test::makeDecoded;

TEST_CASE("estimateBpm: recovers a 120 BPM click track") {
  auto audio = makeClickTrack(/*bpm=*/120.0, /*seconds=*/8.0,
                              /*sampleRate=*/44100);
  // Tolerance is generous: parabolic refinement lands close, but envelope
  // quantisation means we don't assert an exact integer.
  CHECK(estimateBpm(audio) == doctest::Approx(120.0).epsilon(0.05));
}

TEST_CASE("estimateBpm: recovers a 90 BPM click track") {
  auto audio = makeClickTrack(/*bpm=*/90.0, /*seconds=*/8.0,
                              /*sampleRate=*/44100);
  CHECK(estimateBpm(audio) == doctest::Approx(90.0).epsilon(0.05));
}

TEST_CASE("estimateBpm: folds a fast click into the 60-180 band") {
  // 200 BPM is above the band; the estimator should fold it to 100.
  auto audio = makeClickTrack(/*bpm=*/200.0, /*seconds=*/8.0,
                              /*sampleRate=*/44100);
  const double bpm = estimateBpm(audio);
  CHECK(bpm >= 60.0);
  CHECK(bpm < 180.0);
}

TEST_CASE("estimateBpm: silence has no detectable tempo") {
  std::vector<float> silent(44100 * 4, 0.0f);
  auto audio = makeDecoded(silent, /*channels=*/1, /*sampleRate=*/44100);
  CHECK(estimateBpm(audio) == doctest::Approx(0.0));
}

TEST_CASE("estimateBpm: audio shorter than the search window returns 0") {
  std::vector<float> tiny(1000, 0.5f);
  auto audio = makeDecoded(tiny, /*channels=*/1, /*sampleRate=*/44100);
  CHECK(estimateBpm(audio) == doctest::Approx(0.0));
}
