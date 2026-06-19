// Unit tests for core/loudness::measureIntegratedLoudness against fixtures.
//
// Pins the three-state contract (Ok / Silent / Undecodable) and that a real
// signal produces a sane LUFS value. The fixtures are a 1 kHz sine at -20 dBFS
// (measures around -41 LUFS after K-weighting), digital silence, and an m4a the
// decoder can't read.
#include "core/loudness.hpp"
#include "test/test_fixtures.hpp"
#include "vendor/doctest/doctest.h"

using shiranami::audio::LoudnessStatus;
using shiranami::audio::measureIntegratedLoudness;
using shiranami::test::fixturePath;

TEST_CASE(
    "measureIntegratedLoudness: a real signal measures Ok with finite LUFS") {
  auto result = measureIntegratedLoudness(fixturePath("sine.wav"));
  REQUIRE(result.status == LoudnessStatus::Ok);
  // A -20 dBFS 1 kHz tone sits around -41 LUFS; assert a generous window rather
  // than an exact value so codec/rounding differences don't make this brittle.
  CHECK(result.lufs > -50.0);
  CHECK(result.lufs < -30.0);
}

TEST_CASE(
    "measureIntegratedLoudness: matches across wav/flac/mp3 of the same "
    "signal") {
  auto wav = measureIntegratedLoudness(fixturePath("sine.wav"));
  auto flac = measureIntegratedLoudness(fixturePath("sine.flac"));
  auto mp3 = measureIntegratedLoudness(fixturePath("sine.mp3"));
  REQUIRE(wav.status == LoudnessStatus::Ok);
  REQUIRE(flac.status == LoudnessStatus::Ok);
  REQUIRE(mp3.status == LoudnessStatus::Ok);
  // Same source signal → the three encodings should land within ~1 LUFS.
  CHECK(flac.lufs == doctest::Approx(wav.lufs).epsilon(0.02));
  CHECK(mp3.lufs == doctest::Approx(wav.lufs).epsilon(0.05));
}

TEST_CASE("measureIntegratedLoudness: digital silence reports Silent") {
  auto result = measureIntegratedLoudness(fixturePath("silence.wav"));
  CHECK(result.status == LoudnessStatus::Silent);
}

TEST_CASE(
    "measureIntegratedLoudness: an undecodable format reports Undecodable") {
  auto result = measureIntegratedLoudness(fixturePath("undecodable.m4a"));
  CHECK(result.status == LoudnessStatus::Undecodable);
}

TEST_CASE("measureIntegratedLoudness: a missing file reports Undecodable") {
  auto result = measureIntegratedLoudness(fixturePath("nope.wav"));
  CHECK(result.status == LoudnessStatus::Undecodable);
}
