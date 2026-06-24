// Pure C++ musical-key estimation — no N-API. Like core/tempo it works on an
// already-decoded DecodedAudio, so tests can synthesise a chord in memory and
// assert the detected key without a fixture or a JS engine.
//
// The method is the textbook one:
//
//   1. Build a "chromagram": fold the whole track's spectrum into 12 bins, one
//      per pitch class (C, C#, D, …), summing energy regardless of octave. This
//      needs an FFT per frame — see core/fft.
//   2. Correlate that 12-vector against the Krumhansl–Schmuckler key profiles —
//      empirically derived templates for how strongly each pitch class belongs
//      to each major and minor key — rotated through all 12 tonics.
//   3. The best-correlating of the 24 (12 major + 12 minor) profiles is the
//   key.
//
// This is a global, best-effort estimate: it reports a single key for the whole
// file and won't track modulations. Accuracy varies by material — strong on
// tonal pop/rock, weaker on ambiguous or atonal audio.
#pragma once

#include <string>

#include "core/audio_decoder.hpp"

namespace shiranami::audio {

struct KeyResult {
  bool detected = false;  // false → silence / too short / no tonal content
  std::string name;       // e.g. "C major", "A minor" (empty when !detected)
  double confidence =
      0.0;  // best profile correlation, -1..1 (0 when !detected)
};

/**
 * Estimate the global musical key of decoded audio. Returns `detected == false`
 * for silence, audio too short for a single analysis frame, or material with no
 * tonal centre. Never throws.
 */
KeyResult detectKey(const DecodedAudio& audio);

}  // namespace shiranami::audio
