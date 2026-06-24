// Unit tests for core/key::detectKey — pure DSP (FFT chromagram + KS profiles),
// no decoding, no JS.
//
// We synthesise chords whose key is unambiguous (a C-major triad C-E-G; an
// A-minor triad A-C-E) and assert the detected key, plus the silence/too-short
// guards. We deliberately avoid borderline material — key detection is a global
// best-effort estimate and these tests pin the clear cases, not edge accuracy.
#include "core/key.hpp"
#include "test/synth_audio.hpp"
#include "vendor/doctest/doctest.h"

using shiranami::audio::detectKey;
using shiranami::test::makeChord;
using shiranami::test::makeDecoded;

TEST_CASE("detectKey: a C major triad (C-E-G) reports C major") {
  // C4, E4, G4.
  auto audio = makeChord({261.63, 329.63, 392.00}, /*seconds=*/3.0,
                         /*sampleRate=*/44100);
  auto result = detectKey(audio);
  REQUIRE(result.detected);
  CHECK(result.name == "C major");
}

TEST_CASE("detectKey: an A minor triad (A-C-E) reports A minor") {
  // A3, C4, E4 — the relative minor; distinct chord from the C-major case.
  auto audio = makeChord({220.00, 261.63, 329.63}, /*seconds=*/3.0,
                         /*sampleRate=*/44100);
  auto result = detectKey(audio);
  REQUIRE(result.detected);
  CHECK(result.name == "A minor");
}

TEST_CASE("detectKey: silence is not detectable") {
  std::vector<float> silent(44100 * 2, 0.0f);
  auto audio = makeDecoded(silent, /*channels=*/1, /*sampleRate=*/44100);
  auto result = detectKey(audio);
  CHECK_FALSE(result.detected);
  CHECK(result.name.empty());
}

TEST_CASE(
    "detectKey: audio shorter than one analysis frame is not detectable") {
  std::vector<float> tiny(1000, 0.3f);
  auto audio = makeDecoded(tiny, /*channels=*/1, /*sampleRate=*/44100);
  CHECK_FALSE(detectKey(audio).detected);
}
