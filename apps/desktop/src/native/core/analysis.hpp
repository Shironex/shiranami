// Pure C++ orchestrator for the musical-analysis addon — no N-API. Decodes a
// file ONCE (via the shared core/audio_decoder) and runs both the tempo and key
// estimators over the same buffer, so the renderer gets BPM and key from a
// single decode rather than two. Reusable + testable without a JS engine.
//
// This is the file-level entry point; the per-algorithm DSP lives in core/tempo
// and core/key (each operating on already-decoded PCM), which keeps those
// algorithms independently unit-testable with synthesised signals.
#pragma once

#include <string>

namespace shiranami::audio {

/**
 * Two-state outcome, mirroring how the loudness addon distinguishes "measured"
 * from "couldn't decode":
 *   - Ok            → the file decoded; `bpm` and/or `key` may still be unknown
 *                     (0.0 / empty) if that dimension wasn't detectable.
 *   - Unanalyzable  → dr_libs can't read this format (m4a/opus/ogg) or the file
 *                     is unreadable. The caller persists nothing.
 */
enum class AnalysisStatus { Ok, Unanalyzable };

struct AnalysisResult {
  AnalysisStatus status = AnalysisStatus::Unanalyzable;
  double bpm = 0.0;  // 0.0 when tempo couldn't be estimated
  std::string key;   // empty when key couldn't be estimated (e.g. "A minor")
};

/**
 * Decode an audio file and estimate its tempo (BPM) and musical key. Never
 * throws — an unreadable/unsupported file maps to AnalysisStatus::Unanalyzable.
 */
AnalysisResult analyzeAudioFile(const std::string& path);

}  // namespace shiranami::audio
