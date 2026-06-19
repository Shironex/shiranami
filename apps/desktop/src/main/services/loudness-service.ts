/**
 * Loudness analysis (EBU R128 / ReplayGain-style).
 *
 * Measures the integrated loudness (`input_i`-equivalent, in LUFS) of a track.
 * The native libebur128 addon handles the formats dr_libs can decode
 * (mp3/flac/wav) off the main thread; anything it can't decode (m4a/opus/ogg)
 * falls back to the ffmpeg `loudnorm` subprocess. The measured value is
 * persisted on the track row; the renderer derives the playback gain at apply
 * time (target LUFS − measured LUFS), so changing the target re-levels
 * instantly without re-analysis.
 */

import * as fs from 'fs';
import { execFile } from 'child_process';
import { getFFmpegPath, isFFmpegInstalled } from '../downloads/ffmpeg-manager';
import { logger } from '../app/logger';
import { measureLoudnessNative } from '../workers/loudness-host';

/** Max time a single loudnorm pass may run before being abandoned (ms). */
const ANALYZE_TIMEOUT_MS = 120000;

interface LoudnormJson {
  input_i?: string;
}

/**
 * Measure the integrated loudness (LUFS) of a single audio file.
 *
 * Tries the native libebur128 addon first; for formats it can't decode (or when
 * the addon is unavailable) falls back to ffmpeg. Returns the finite LUFS
 * value, or `null` when the measurement is unusable (file missing, aborted,
 * non-finite loudness such as a silent track, or ffmpeg missing on a format the
 * addon couldn't handle). A `null` result is treated as "skip" by callers.
 *
 * Abort granularity is between-track: a native measurement is sub-second and
 * runs to completion, so we honour the signal before dispatching and let the
 * batch loop handle cancellation; the ffmpeg fallback still aborts mid-pass.
 */
export async function measureLoudness(
  filePath: string,
  signal?: AbortSignal
): Promise<number | null> {
  if (signal?.aborted) {
    return null;
  }
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const native = await measureLoudnessNative(filePath);
  if (native.status === 'ok') {
    return native.lufs;
  }
  if (native.status === 'silent') {
    // Decoded but non-finite (digital silence) — nothing to measure. ffmpeg
    // would return -inf here too, so skip the subprocess.
    return null;
  }

  // 'undecodable' (format dr_libs can't read, or addon unavailable) → ffmpeg.
  return measureLoudnessFfmpeg(filePath, signal);
}

/**
 * Fallback path: measure integrated loudness with ffmpeg's `loudnorm` filter.
 * Used for formats the native addon can't decode (m4a/opus/ogg) and when the
 * native addon is unavailable. Returns `null` on any failure.
 */
async function measureLoudnessFfmpeg(
  filePath: string,
  signal?: AbortSignal
): Promise<number | null> {
  // Re-check the signal: the native attempt may have spanned an abort (e.g. a
  // teardown that aborted the batch), and we don't want to spawn ffmpeg after.
  if (signal?.aborted) {
    return null;
  }
  if (!isFFmpegInstalled()) {
    logger.warn('[loudness] ffmpeg not installed — skipping analysis');
    return null;
  }

  return new Promise<number | null>(resolve => {
    // -af loudnorm=print_format=json runs the first (analysis) pass and prints
    // a JSON object with the measured values to stderr; -f null discards audio.
    execFile(
      getFFmpegPath(),
      ['-hide_banner', '-i', filePath, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
      { timeout: ANALYZE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, signal },
      (err, _stdout, stderr) => {
        if (err && (signal?.aborted || err.name === 'AbortError')) {
          resolve(null);
          return;
        }
        // ffmpeg writes the loudnorm JSON to stderr even on a normal exit.
        const lufs = parseIntegratedLufs(stderr ?? '');
        if (lufs === null) {
          if (err) {
            logger.warn(`[loudness] Analysis failed for ${filePath}: ${err.message}`);
          }
          resolve(null);
          return;
        }
        resolve(lufs);
      }
    );
    // No separate 'error' listener: execFile delivers spawn/exec errors to the
    // callback above as `err`, which already resolves to null.
  });
}

/**
 * Extract the integrated loudness (`input_i`) from ffmpeg loudnorm's stderr.
 * Returns the finite LUFS value, or `null` for missing / non-finite values
 * (e.g. `-inf` on a silent track).
 *
 * Exported for unit testing.
 */
export function parseIntegratedLufs(stderr: string): number | null {
  // The JSON object is the trailing `{ ... }` block in loudnorm's stderr.
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;

  let parsed: LoudnormJson;
  try {
    parsed = JSON.parse(stderr.slice(start, end + 1)) as LoudnormJson;
  } catch {
    return null;
  }

  if (parsed.input_i === undefined) return null;
  const value = Number.parseFloat(parsed.input_i);
  if (!Number.isFinite(value)) return null;
  return value;
}
