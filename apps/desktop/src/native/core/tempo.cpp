#include "core/tempo.hpp"

#include <cmath>    // std::lround
#include <cstddef>  // std::size_t
#include <vector>

namespace shiranami::audio {

namespace {

// The onset envelope is sampled at a fixed low rate regardless of the file's
// sample rate, so the lag↔BPM math is independent of the source format. 100 Hz
// gives ~10 ms resolution — fine for tempo, and small enough that
// autocorrelation over a whole song stays cheap.
constexpr double kEnvelopeRateHz = 100.0;

/** Downmix interleaved multi-channel PCM to a single mono frame energy series:
 *  one energy value per `hop` input frames. Energy = mean square of all samples
 *  (every channel) in the window — loudness rises and falls drive the onsets.
 */
std::vector<double> frameEnergies(const DecodedAudio& audio, std::size_t hop) {
  const std::size_t channels = audio.channels;
  const std::size_t totalFrames = static_cast<std::size_t>(audio.frameCount);
  std::vector<double> energies;
  energies.reserve(totalFrames / hop + 1);

  for (std::size_t start = 0; start + hop <= totalFrames; start += hop) {
    double sumSq = 0.0;
    for (std::size_t f = start; f < start + hop; ++f) {
      for (std::size_t c = 0; c < channels; ++c) {
        const float s = audio.samples[f * channels + c];
        sumSq += static_cast<double>(s) * static_cast<double>(s);
      }
    }
    energies.push_back(sumSq / static_cast<double>(hop * channels));
  }
  return energies;
}

/** Onset strength = positive first difference of the energy envelope (a.k.a.
 *  half-wave-rectified flux). Rising energy (an attack) yields a spike; decay
 *  is clamped to zero so sustained notes don't register as beats. */
std::vector<double> onsetEnvelope(const std::vector<double>& energies) {
  if (energies.size() < 2) return {};
  std::vector<double> onset(energies.size(), 0.0);
  for (std::size_t i = 1; i < energies.size(); ++i) {
    const double diff = energies[i] - energies[i - 1];
    onset[i] = diff > 0.0 ? diff : 0.0;
  }
  return onset;
}

/** Parabolic interpolation around a discrete peak at index `i` of `r`. Fits a
 *  parabola through (i-1, i, i+1) and returns the sub-sample offset of its
 *  vertex in [-0.5, 0.5], giving a fractional lag (hence fractional BPM). */
double parabolicPeakOffset(const std::vector<double>& r, std::size_t i) {
  if (i == 0 || i + 1 >= r.size()) return 0.0;
  const double a = r[i - 1];
  const double b = r[i];
  const double c = r[i + 1];
  const double denom = a - 2.0 * b + c;
  if (denom == 0.0) return 0.0;
  return 0.5 * (a - c) / denom;
}

/** Fold a tempo into [kMinBpm, kMaxBpm) by doubling/halving. Autocorrelation
 *  commonly locks onto half or double the true tempo; folding canonicalises it.
 */
double foldIntoRange(double bpm) {
  if (bpm <= 0.0) return 0.0;
  while (bpm < kMinBpm) bpm *= 2.0;
  while (bpm >= kMaxBpm) bpm /= 2.0;
  return bpm;
}

}  // namespace

double estimateBpm(const DecodedAudio& audio) {
  if (!audio.ok()) return 0.0;

  // 1. Onset envelope at kEnvelopeRateHz. hop = samples per envelope sample.
  const std::size_t hop = static_cast<std::size_t>(
      static_cast<double>(audio.sampleRate) / kEnvelopeRateHz);
  if (hop == 0) return 0.0;

  const std::vector<double> onset = onsetEnvelope(frameEnergies(audio, hop));

  // 2. Lag search bounds. BPM = 60 · rate / lag, so a lag of `rate` frames is
  //    60 BPM and `rate/3` frames is 180 BPM. We need at least a couple of beat
  //    periods of envelope to autocorrelate meaningfully.
  const std::size_t minLag =
      static_cast<std::size_t>(std::lround(60.0 * kEnvelopeRateHz / kMaxBpm));
  const std::size_t maxLag =
      static_cast<std::size_t>(std::lround(60.0 * kEnvelopeRateHz / kMinBpm));
  if (minLag < 1 || onset.size() < maxLag * 2) return 0.0;

  // 3. Autocorrelation over the lag band; keep the strongest lag.
  std::vector<double> corr(maxLag + 1, 0.0);
  double bestValue = 0.0;
  std::size_t bestLag = 0;
  for (std::size_t lag = minLag; lag <= maxLag; ++lag) {
    double sum = 0.0;
    for (std::size_t i = 0; i + lag < onset.size(); ++i) {
      sum += onset[i] * onset[i + lag];
    }
    corr[lag] = sum;
    if (sum > bestValue) {
      bestValue = sum;
      bestLag = lag;
    }
  }
  if (bestLag == 0 || bestValue <= 0.0) return 0.0;

  // 4. Refine the integer lag to a fractional one, then convert to BPM + fold.
  const double refinedLag =
      static_cast<double>(bestLag) + parabolicPeakOffset(corr, bestLag);
  if (refinedLag <= 0.0) return 0.0;
  return foldIntoRange(60.0 * kEnvelopeRateHz / refinedLag);
}

}  // namespace shiranami::audio
