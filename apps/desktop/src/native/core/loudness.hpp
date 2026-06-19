// Pure C++ integrated-loudness measurement — no N-API. Decodes a file (via the
// shared core/audio_decoder) and runs it through libebur128 to get an EBU R128
// integrated-loudness value in LUFS. Reusable + testable without a JS engine,
// exactly like core/peaks and core/audio_decoder.
//
// "LUFS" = Loudness Units relative to Full Scale. "Integrated" loudness is the
// single number describing how loud a whole track is, gated per the EBU R128 /
// ITU-R BS.1770 standard — the same value ffmpeg's `loudnorm` reports as
// `input_i`. We persist it per track and derive the playback gain from it.
#pragma once

#include <string>

namespace shiranami::audio {

/**
 * Why this is a three-state result instead of a bare `double`:
 *
 * The caller (loudness-service.ts) needs to tell *three* outcomes apart, and a
 * single number can't carry that:
 *   - Ok          → we measured a usable value; use it.
 *   - Silent      → we decoded the audio but the loudness is non-finite
 *                   (digital silence reads as -inf LUFS). There's nothing to
 *                   measure — treated as "skip", same as ffmpeg's -inf today.
 *   - Undecodable → dr_libs can't read this format (m4a/opus/ogg) or the file
 *                   is unreadable. The caller falls back to the ffmpeg path.
 *
 * Folding Silent and Undecodable into one "null" would make every silent track
 * pointlessly re-run through ffmpeg (which also returns -inf), so we keep them
 * distinct.
 */
enum class LoudnessStatus { Ok, Undecodable, Silent };

struct LoudnessResult {
  LoudnessStatus status = LoudnessStatus::Undecodable;
  double lufs = 0.0;  // only meaningful when status == Ok
};

/**
 * Measure the EBU R128 integrated loudness (LUFS) of an audio file. Decodes
 * with the shared dr_libs decoder, then feeds the interleaved float PCM to
 * libebur128. Never throws — every failure maps onto a LoudnessStatus.
 */
LoudnessResult measureIntegratedLoudness(const std::string& path);

}  // namespace shiranami::audio
