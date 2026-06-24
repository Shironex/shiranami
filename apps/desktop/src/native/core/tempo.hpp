// Pure C++ tempo (BPM) estimation — no N-API. Operates on already-decoded PCM
// (a DecodedAudio), so it's trivially unit-testable: a test can synthesise a
// click track at a known tempo in memory and assert the estimate, with no
// fixture file and no JS engine.
//
// The approach (chosen for the C++ learning ladder) is the classic FFT-free
// one:
//
//   1. Build an "onset strength envelope" — a low-rate signal that spikes when
//      energy rises (a drum hit, a note attack). We frame the audio, take each
//      frame's energy, and keep the positive frame-to-frame increase.
//   2. Autocorrelate that envelope. A steady beat makes the envelope correlate
//      strongly with itself at a lag equal to the beat period.
//   3. The lag with the strongest correlation, within the 60–180 BPM band, is
//      the tempo. We refine it with parabolic interpolation for a fractional
//      BPM, and fold obvious half/double-tempo errors into the band.
#pragma once

#include "core/audio_decoder.hpp"

namespace shiranami::audio {

/** Lowest tempo we report. Below this we fold up (double) to avoid half-time
 *  errors; the autocorrelation search itself is bounded to [MIN, MAX] BPM. */
constexpr double kMinBpm = 60.0;
/** Highest tempo we report. Above this we fold down (halve). */
constexpr double kMaxBpm = 180.0;

/**
 * Estimate the tempo of decoded audio in beats per minute.
 *
 * Returns 0.0 when the tempo can't be estimated — silence, a signal with no
 * discernible beat, or audio too short to autocorrelate over the search window.
 * Callers treat 0.0 as "unknown" (persist null). Never throws.
 */
double estimateBpm(const DecodedAudio& audio);

}  // namespace shiranami::audio
