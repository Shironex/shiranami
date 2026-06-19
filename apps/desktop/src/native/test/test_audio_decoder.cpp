// Unit tests for core/audio_decoder::decodeAudioFile against real fixture
// files.
//
// These prove the dr_libs-backed decoder turns each supported container into
// interleaved float PCM with the expected format, and reports failure (rather
// than crashing) on a format it can't handle. Fixtures are tiny 1s, stereo,
// 48 kHz clips committed under test/fixtures/.
#include "core/audio_decoder.hpp"
#include "test/test_fixtures.hpp"
#include "vendor/doctest/doctest.h"

using shiranami::audio::decodeAudioFile;
using shiranami::test::fixturePath;

namespace {

// Every supported fixture shares the same format, so one helper checks them
// all.
void checkDecodesAsStereo48k(const std::string& file) {
  shiranami::audio::DecodedAudio decoded = decodeAudioFile(fixturePath(file));
  REQUIRE(decoded.ok());
  CHECK(decoded.channels == 2);
  CHECK(decoded.sampleRate == 48000);
  CHECK(decoded.frameCount > 0);
  CHECK(decoded.samples != nullptr);
}

}  // namespace

TEST_CASE("decodeAudioFile: decodes WAV to stereo 48k float PCM") {
  checkDecodesAsStereo48k("sine.wav");
}

TEST_CASE("decodeAudioFile: decodes FLAC to stereo 48k float PCM") {
  checkDecodesAsStereo48k("sine.flac");
}

TEST_CASE("decodeAudioFile: decodes MP3 to stereo 48k float PCM") {
  checkDecodesAsStereo48k("sine.mp3");
}

TEST_CASE("decodeAudioFile: reports failure for an unsupported format") {
  // dr_libs can't decode AAC/m4a — the decoder must return !ok(), not crash.
  shiranami::audio::DecodedAudio decoded =
      decodeAudioFile(fixturePath("undecodable.m4a"));
  CHECK_FALSE(decoded.ok());
}

TEST_CASE("decodeAudioFile: reports failure for a missing file") {
  shiranami::audio::DecodedAudio decoded =
      decodeAudioFile(fixturePath("does-not-exist.wav"));
  CHECK_FALSE(decoded.ok());
}
