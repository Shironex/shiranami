// Pure C++ audio decoding — no N-API. Turns a .wav/.flac/.mp3 file into
// interleaved 32-bit float PCM. Reused by every addon that needs samples
// (the waveform addon today; the LUFS/BPM addons later).
#pragma once

#include <cstdint>
#include <string>

namespace shiranami::audio {

/**
 * Decoded PCM plus its format. Owns the sample buffer and frees it in the
 * destructor (RAII) — callers never free manually, and an early return can't
 * leak. Non-copyable (it owns a raw buffer) but movable.
 *
 * RAII = "Resource Acquisition Is Initialization": the object's lifetime IS the
 * buffer's lifetime. When a DecodedAudio goes out of scope, ~DecodedAudio runs
 * and releases the memory automatically. This replaces the scattered manual
 * `drwav_free(...)` calls the old code needed at every exit path.
 */
struct DecodedAudio {
  float* samples = nullptr;  // interleaved, `channels` samples per frame
  std::uint64_t frameCount = 0;
  std::uint32_t channels = 0;
  std::uint32_t sampleRate = 0;

  DecodedAudio() = default;
  ~DecodedAudio();

  // No copying (would double-free the buffer); moving transfers ownership.
  DecodedAudio(const DecodedAudio&) = delete;
  DecodedAudio& operator=(const DecodedAudio&) = delete;
  DecodedAudio(DecodedAudio&& other) noexcept;
  DecodedAudio& operator=(DecodedAudio&& other) noexcept;

  /** True when decoding produced usable audio. */
  bool ok() const {
    return samples != nullptr && frameCount > 0 && channels > 0 &&
           sampleRate > 0;
  }
};

/**
 * Decode a .wav/.flac/.mp3 file to interleaved float PCM. The returned
 * DecodedAudio has `.ok() == false` when the format is unsupported or the file
 * can't be read — no exceptions are thrown.
 */
DecodedAudio decodeAudioFile(const std::string& path);

}  // namespace shiranami::audio
