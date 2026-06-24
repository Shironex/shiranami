#include "core/analysis.hpp"

#include "core/audio_decoder.hpp"
#include "core/key.hpp"
#include "core/tempo.hpp"

namespace shiranami::audio {

AnalysisResult analyzeAudioFile(const std::string& path) {
  // Decode to interleaved float PCM. The decoder owns its buffer and frees it
  // when `decoded` leaves scope — no manual free on any return path below.
  DecodedAudio decoded = decodeAudioFile(path);
  if (!decoded.ok()) {
    // Unsupported format / unreadable file → nothing to persist.
    return {AnalysisStatus::Unanalyzable, 0.0, ""};
  }

  // One decode, two analyses over the same buffer.
  const double bpm = estimateBpm(decoded);
  const KeyResult key = detectKey(decoded);

  return {AnalysisStatus::Ok, bpm, key.detected ? key.name : std::string()};
}

}  // namespace shiranami::audio
