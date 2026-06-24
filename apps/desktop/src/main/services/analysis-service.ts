/**
 * Musical analysis (tempo + key).
 *
 * Estimates a track's tempo (BPM) and musical key via the native analysis addon
 * (energy-autocorrelation tempo + an FFT chromagram key) off the main thread.
 * Unlike loudness there is NO ffmpeg fallback: the estimate is purely the
 * addon's DSP, so when the addon can't decode a file (m4a/opus/ogg) or isn't
 * built, the track is simply left unanalysed. The measured values are persisted
 * on the track row.
 */

import * as fs from 'fs';
import { analyzeTrackNative } from '../workers/analysis-host';

/** Per-track analysis outcome. A field is null when that dimension wasn't
 *  detectable (no beat / no tonal centre). */
export interface TrackAnalysis {
  bpm: number | null;
  musicalKey: string | null;
}

/**
 * Estimate a track's tempo + key. Returns the analysis, or `null` when there is
 * nothing to persist — file missing, aborted, the format is undecodable / the
 * addon is unavailable, or neither tempo nor key was detectable. A `null`
 * result is treated as "skip" by callers.
 *
 * Abort granularity is between-track: a native analysis is sub-second and runs
 * to completion, so we honour the signal before dispatching and again after the
 * off-thread work returns, letting the batch loop handle cancellation.
 */
export async function analyzeTrack(
  filePath: string,
  signal?: AbortSignal
): Promise<TrackAnalysis | null> {
  if (signal?.aborted) {
    return null;
  }
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const native = await analyzeTrackNative(filePath);
  // The native analysis runs to completion off-thread; if the batch was aborted
  // while it ran, drop the result rather than persist it.
  if (signal?.aborted) {
    return null;
  }
  if (native.status !== 'ok') {
    return null;
  }

  // The addon reports bpm 0 / empty key when a dimension wasn't detectable;
  // collapse those to null. If neither was detected there's nothing to persist.
  const bpm = native.bpm > 0 ? native.bpm : null;
  const musicalKey = native.key !== '' ? native.key : null;
  if (bpm === null && musicalKey === null) {
    return null;
  }
  return { bpm, musicalKey };
}
