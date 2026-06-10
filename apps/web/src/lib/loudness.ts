import { LOUDNESS_MAX_GAIN_DB } from '@/stores/usePlaybackStore';

/**
 * Compute the ReplayGain-style adjustment (dB) for a track given its measured
 * integrated loudness and the user's target. Returns 0 when the measurement is
 * absent/non-finite (track unanalysed) so leveling is a no-op for those tracks.
 *
 * The result is clamped to ±LOUDNESS_MAX_GAIN_DB to avoid extreme boosts on
 * very quiet sources blowing out the signal.
 */
export function computeLoudnessGainDb(
  measuredLufs: number | null | undefined,
  targetLufs: number
): number {
  if (measuredLufs == null || !Number.isFinite(measuredLufs)) return 0;
  const gain = targetLufs - measuredLufs;
  return Math.max(-LOUDNESS_MAX_GAIN_DB, Math.min(LOUDNESS_MAX_GAIN_DB, gain));
}

/** Convert a decibel value to a linear amplitude multiplier. */
export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}
