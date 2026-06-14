#include "core/peaks.hpp"

#include <cmath>

namespace shiranami::audio {

void reducePeaks(const float* frames, std::size_t frameCount,
                 std::uint32_t channels, int buckets, float* out) {
  if (buckets <= 0 || out == nullptr) return;  // core stays safe if called directly
  if (frameCount == 0 || channels == 0) {
    for (int b = 0; b < buckets; b++) out[b] = 0.0f;
    return;
  }

  // Fractional on purpose: a song has millions of frames but only a few hundred
  // bars, and the counts rarely divide evenly. Recomputing each window from the
  // double avoids rounding error drifting across thousands of bars.
  const double framesPerBucket = static_cast<double>(frameCount) / buckets;

  for (int b = 0; b < buckets; b++) {
    std::size_t start = static_cast<std::size_t>(b * framesPerBucket);
    std::size_t end = static_cast<std::size_t>((b + 1) * framesPerBucket);
    if (end > frameCount) end = frameCount;  // clamp the final bar

    float peak = 0.0f;
    for (std::size_t f = start; f < end; f++) {
      const float* frame = frames + f * channels;
      for (std::uint32_t c = 0; c < channels; c++) {
        float a = std::fabs(frame[c]);  // amplitude is symmetric around 0
        if (a > peak) peak = a;
      }
    }
    out[b] = peak;
  }
}

}  // namespace shiranami::audio
