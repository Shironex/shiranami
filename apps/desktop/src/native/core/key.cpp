#include "core/key.hpp"

#include <array>
#include <cmath>    // std::log2, std::lround, std::sqrt
#include <cstddef>  // std::size_t
#include <vector>

#include "core/fft.hpp"

namespace shiranami::audio {

namespace {

constexpr int kPitchClasses = 12;

// FFT frame size and hop (in input frames, post-downmix). 4096 samples ≈ 93 ms
// at 44.1 kHz — long enough to resolve adjacent semitones in the bass register;
// 50% overlap (hop 2048) smooths the chromagram over time.
constexpr std::size_t kFrameSize = 4096;
constexpr std::size_t kHopSize = 2048;

// Krumhansl–Schmuckler tonal-hierarchy profiles (the "K-K" weights). Index 0 is
// the tonic, 1 a semitone above, … 11 a major-seventh above. We correlate these
// (rotated to each of the 12 tonics) against the measured chromagram.
constexpr std::array<double, kPitchClasses> kMajorProfile = {
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88};
constexpr std::array<double, kPitchClasses> kMinorProfile = {
    6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17};

// Pitch-class names. Index 0 == C because MIDI note % 12 == 0 is C.
constexpr std::array<const char*, kPitchClasses> kNoteNames = {
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};

/** Downmix interleaved PCM to a mono buffer (average across channels). */
std::vector<double> downmixMono(const DecodedAudio& audio) {
  const std::size_t channels = audio.channels;
  const std::size_t frames = static_cast<std::size_t>(audio.frameCount);
  std::vector<double> mono(frames, 0.0);
  for (std::size_t f = 0; f < frames; ++f) {
    double sum = 0.0;
    for (std::size_t c = 0; c < channels; ++c) {
      sum += audio.samples[f * channels + c];
    }
    mono[f] = sum / static_cast<double>(channels);
  }
  return mono;
}

/** Map an FFT bin to its pitch class (0..11), or -1 when it's out of the useful
 *  musical range. bin k is `k·sampleRate/fftSize` Hz; we convert to a MIDI note
 *  (A4 = 69 = 440 Hz) and take it mod 12. */
int binToPitchClass(std::size_t k, std::size_t fftSize, double sampleRate) {
  if (k == 0) return -1;  // DC carries no pitch
  const double freq =
      static_cast<double>(k) * sampleRate / static_cast<double>(fftSize);
  // Restrict to roughly the piano range; sub-bass and ultrasonics are noise for
  // key estimation and would pollute the chromagram.
  if (freq < 27.5 || freq > 5000.0) return -1;
  const double midi = 69.0 + 12.0 * std::log2(freq / 440.0);
  const int note = static_cast<int>(std::lround(midi));
  return ((note % kPitchClasses) + kPitchClasses) % kPitchClasses;
}

/** Pearson correlation between the 12-bin chroma and a rotated key profile. */
double correlate(const std::array<double, kPitchClasses>& chroma,
                 const std::array<double, kPitchClasses>& profile, int tonic) {
  double meanC = 0.0;
  double meanP = 0.0;
  for (int i = 0; i < kPitchClasses; ++i) {
    meanC += chroma[i];
    meanP += profile[i];
  }
  meanC /= kPitchClasses;
  meanP /= kPitchClasses;

  double num = 0.0;
  double denC = 0.0;
  double denP = 0.0;
  for (int i = 0; i < kPitchClasses; ++i) {
    // Rotate the profile so its tonic aligns with pitch class `tonic`.
    const double p = profile[(i - tonic + kPitchClasses) % kPitchClasses];
    const double dc = chroma[i] - meanC;
    const double dp = p - meanP;
    num += dc * dp;
    denC += dc * dc;
    denP += dp * dp;
  }
  const double den = std::sqrt(denC * denP);
  return den == 0.0 ? 0.0 : num / den;
}

}  // namespace

KeyResult detectKey(const DecodedAudio& audio) {
  if (!audio.ok()) return {};

  const std::vector<double> mono = downmixMono(audio);
  if (mono.size() < kFrameSize) return {};  // too short for one analysis frame

  // 1. Accumulate a chromagram over overlapping frames.
  std::array<double, kPitchClasses> chroma = {};
  std::vector<double> frame(kFrameSize);
  const double sampleRate = static_cast<double>(audio.sampleRate);
  bool anyEnergy = false;

  for (std::size_t start = 0; start + kFrameSize <= mono.size();
       start += kHopSize) {
    for (std::size_t i = 0; i < kFrameSize; ++i) {
      frame[i] = mono[start + i];
    }
    const std::vector<double> mags = magnitudeSpectrum(frame);
    for (std::size_t k = 0; k < mags.size(); ++k) {
      const int pc = binToPitchClass(k, kFrameSize, sampleRate);
      if (pc >= 0) {
        chroma[static_cast<std::size_t>(pc)] += mags[k];
        if (mags[k] > 0.0) anyEnergy = true;
      }
    }
  }
  if (!anyEnergy) return {};  // silence / no tonal content

  // 2. Best of the 24 rotated profiles (12 major, 12 minor).
  KeyResult best;
  best.confidence = -2.0;  // below the -1..1 correlation range
  for (int tonic = 0; tonic < kPitchClasses; ++tonic) {
    const double major = correlate(chroma, kMajorProfile, tonic);
    if (major > best.confidence) {
      best = {
          true,
          std::string(kNoteNames[static_cast<std::size_t>(tonic)]) + " major",
          major};
    }
    const double minor = correlate(chroma, kMinorProfile, tonic);
    if (minor > best.confidence) {
      best = {
          true,
          std::string(kNoteNames[static_cast<std::size_t>(tonic)]) + " minor",
          minor};
    }
  }
  return best;
}

}  // namespace shiranami::audio
