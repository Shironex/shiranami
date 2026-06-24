// Test-only helper: build a DecodedAudio from in-memory samples.
//
// core/tempo and core/key take a DecodedAudio (already-decoded PCM), so their
// unit tests can synthesise a signal — a click track at a known BPM, a chord in
// a known key — and assert the estimate without any fixture file or decoder.
//
// DecodedAudio frees its buffer with std::free in its destructor (see
// core/audio_decoder.cpp), so we allocate the buffer with std::malloc to match;
// returning by value moves ownership into the caller, whose destructor frees
// it.
#pragma once

#include <cmath>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "core/audio_decoder.hpp"

namespace shiranami::test {

/** Wrap an interleaved float buffer as a DecodedAudio (malloc-backed). */
inline shiranami::audio::DecodedAudio makeDecoded(
    const std::vector<float>& interleaved, std::uint32_t channels,
    std::uint32_t sampleRate) {
  shiranami::audio::DecodedAudio audio;
  audio.channels = channels;
  audio.sampleRate = sampleRate;
  audio.frameCount = interleaved.size() / channels;
  const std::size_t bytes = interleaved.size() * sizeof(float);
  audio.samples = static_cast<float*>(std::malloc(bytes));
  std::memcpy(audio.samples, interleaved.data(), bytes);
  return audio;
}

/** Mono click track: a short energy burst at each beat, silence between. Drives
 *  the onset envelope that core/tempo autocorrelates. */
inline shiranami::audio::DecodedAudio makeClickTrack(double bpm, double seconds,
                                                     std::uint32_t sampleRate) {
  const std::size_t total =
      static_cast<std::size_t>(seconds * static_cast<double>(sampleRate));
  std::vector<float> samples(total, 0.0f);
  const std::size_t period =
      static_cast<std::size_t>(60.0 / bpm * static_cast<double>(sampleRate));
  const std::size_t burst = sampleRate / 20;  // ~50 ms of energy per beat
  for (std::size_t beat = 0; beat < total; beat += period) {
    for (std::size_t i = 0; i < burst && beat + i < total; ++i) {
      samples[beat + i] = 0.8f;
    }
  }
  return makeDecoded(samples, 1, sampleRate);
}

/** Mono sum of sine tones (e.g. a chord), normalised to avoid clipping. */
inline shiranami::audio::DecodedAudio makeChord(
    const std::vector<double>& freqs, double seconds,
    std::uint32_t sampleRate) {
  const std::size_t total =
      static_cast<std::size_t>(seconds * static_cast<double>(sampleRate));
  std::vector<float> samples(total, 0.0f);
  for (std::size_t n = 0; n < total; ++n) {
    double acc = 0.0;
    for (double f : freqs) {
      acc += std::sin(2.0 * M_PI * f * static_cast<double>(n) /
                      static_cast<double>(sampleRate));
    }
    samples[n] = static_cast<float>(acc / static_cast<double>(freqs.size()));
  }
  return makeDecoded(samples, 1, sampleRate);
}

}  // namespace shiranami::test
