#include "core/loudness.hpp"

#include <cmath>  // std::isfinite

#include "core/audio_decoder.hpp"

// libebur128 is a C library. Its header already wraps itself in `extern "C"`,
// so a C++ translation unit can include it directly. The .c source is compiled
// as C and listed in binding.gyp.
#include "vendor/libebur128/ebur128.h"

namespace shiranami::audio {

namespace {

// --- RAII lifetime for the analyzer handle ----------------------------------
//
// ebur128_init() returns a heap-allocated state that MUST be released with
// ebur128_destroy(&state). The function below has several early-return paths;
// rather than repeat the destroy call (and risk forgetting one — the classic C
// leak), we wrap the handle so its destructor always runs. Same pattern as
// DecodedAudio in audio_decoder: lifetime of the object == lifetime of the
// resource.
//
// Note ebur128_destroy takes a POINTER to the handle (ebur128_state**) so it
// can null it out; we hand it the address of our member.
class Ebur128State {
 public:
  Ebur128State(unsigned int channels, unsigned long sampleRate, int mode)
      : state_(ebur128_init(channels, sampleRate, mode)) {}

  ~Ebur128State() {
    if (state_ != nullptr) ebur128_destroy(&state_);
  }

  // Non-copyable (owns a raw handle); we never need to copy it.
  Ebur128State(const Ebur128State&) = delete;
  Ebur128State& operator=(const Ebur128State&) = delete;

  ebur128_state* get() const { return state_; }
  bool ok() const { return state_ != nullptr; }

 private:
  ebur128_state* state_;
};

}  // namespace

LoudnessResult measureIntegratedLoudness(const std::string& path) {
  // 1. Decode to interleaved float PCM. The decoder owns its buffer and frees
  //    it when `decoded` leaves scope — no manual free on any return below.
  DecodedAudio decoded = decodeAudioFile(path);
  if (!decoded.ok()) {
    // Unsupported format / unreadable file → let the caller try ffmpeg.
    return {LoudnessStatus::Undecodable, 0.0};
  }

  // 2. Initialise the analyzer in MODE_I (integrated loudness). The mode flags
  //    tell libebur128 which measurements to compute; MODE_I is the gated
  //    whole-program loudness we want (it implies MODE_M internally).
  Ebur128State analyzer(decoded.channels, decoded.sampleRate, EBUR128_MODE_I);
  if (!analyzer.ok()) {
    // Allocation failure is rare; fall back to ffmpeg rather than report 0.
    return {LoudnessStatus::Undecodable, 0.0};
  }

  // 3. Feed all frames at once. add_frames_float takes the interleaved float
  //    buffer and a FRAME count (not a sample count) — one frame is one sample
  //    per channel, which is exactly how DecodedAudio stores frameCount.
  if (ebur128_add_frames_float(analyzer.get(), decoded.samples,
                               static_cast<size_t>(decoded.frameCount)) !=
      EBUR128_SUCCESS) {
    return {LoudnessStatus::Undecodable, 0.0};
  }

  // 4. Read the integrated loudness. Digital silence yields -HUGE_VAL (-inf);
  //    std::isfinite filters that and any NaN, mirroring how the ffmpeg path
  //    rejects a non-finite `input_i`.
  double lufs = 0.0;
  if (ebur128_loudness_global(analyzer.get(), &lufs) != EBUR128_SUCCESS ||
      !std::isfinite(lufs)) {
    return {LoudnessStatus::Silent, 0.0};
  }

  return {LoudnessStatus::Ok, lufs};
}

}  // namespace shiranami::audio
