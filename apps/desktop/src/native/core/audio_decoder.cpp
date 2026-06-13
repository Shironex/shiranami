#include "core/audio_decoder.hpp"

#include <cctype>
#include <cstdlib>  // std::free
#include <utility>  // std::move

// Declarations only (the *_IMPLEMENTATION lives in
// vendor/dr_libs/dr_libs_impl.cpp).
#include "vendor/dr_libs/dr_flac.h"
#include "vendor/dr_libs/dr_mp3.h"
#include "vendor/dr_libs/dr_wav.h"

namespace shiranami::audio {

namespace {

enum class Codec { Wav, Flac, Mp3, Unsupported };

Codec codecFromPath(const std::string& path) {
  std::size_t dot = path.find_last_of('.');
  if (dot == std::string::npos) return Codec::Unsupported;
  std::string ext = path.substr(dot + 1);
  for (char& c : ext) c = static_cast<char>(std::tolower((unsigned char)c));
  if (ext == "wav" || ext == "wave") return Codec::Wav;
  if (ext == "flac") return Codec::Flac;
  if (ext == "mp3") return Codec::Mp3;
  return Codec::Unsupported;
}

}  // namespace

// --- RAII lifetime: the buffer is freed exactly once, automatically ---------
//
// dr_libs allocates the sample buffer with its default allocator (malloc), so
// the matching release is plain free() — the same thing drwav_free/drflac_free/
// drmp3_free do internally when given null allocation callbacks. One destructor
// handles all three codecs.
DecodedAudio::~DecodedAudio() { std::free(samples); }

DecodedAudio::DecodedAudio(DecodedAudio&& other) noexcept {
  *this = std::move(other);
}

DecodedAudio& DecodedAudio::operator=(DecodedAudio&& other) noexcept {
  if (this != &other) {
    std::free(samples);  // release whatever we currently hold
    samples = other.samples;
    frameCount = other.frameCount;
    channels = other.channels;
    sampleRate = other.sampleRate;
    // Null the source so its destructor doesn't free the buffer we just took.
    other.samples = nullptr;
    other.frameCount = 0;
    other.channels = 0;
    other.sampleRate = 0;
  }
  return *this;
}

DecodedAudio decodeAudioFile(const std::string& path) {
  DecodedAudio out;

  switch (codecFromPath(path)) {
    case Codec::Wav: {
      drwav_uint64 frames = 0;
      out.samples = drwav_open_file_and_read_pcm_frames_f32(
          path.c_str(), &out.channels, &out.sampleRate, &frames, nullptr);
      out.frameCount = frames;
      break;
    }
    case Codec::Flac: {
      drflac_uint64 frames = 0;
      out.samples = drflac_open_file_and_read_pcm_frames_f32(
          path.c_str(), &out.channels, &out.sampleRate, &frames, nullptr);
      out.frameCount = frames;
      break;
    }
    case Codec::Mp3: {
      drmp3_config cfg;
      drmp3_uint64 frames = 0;
      out.samples = drmp3_open_file_and_read_pcm_frames_f32(path.c_str(), &cfg,
                                                            &frames, nullptr);
      out.channels = cfg.channels;
      out.sampleRate = cfg.sampleRate;
      out.frameCount = frames;
      break;
    }
    case Codec::Unsupported:
      break;
  }

  return out;  // moved out; .ok() is false if nothing decoded
}

}  // namespace shiranami::audio
