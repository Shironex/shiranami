import { LOUDNESS_MAX_GAIN_DB, type LoudnessLevelingMode } from '@/stores/usePlaybackStore';

/**
 * Post-gain true-peak ceiling (dBTP). A positive leveling gain is capped so
 * the boosted signal's measured true peak stays at or below this — the 1 dB
 * of headroom is EBU R128 s1's allowance for lossy-decode overshoot. Cuts are
 * never limited: attenuating an already-hot master is always safe.
 */
export const TRUE_PEAK_CEILING_DB = -1;

/**
 * The measured loudness surface of a track, as the leveling math consumes it.
 * All three come from the analysis run; any of them may be absent (unanalysed
 * track, v1-era row, silent file, no album).
 */
export interface TrackLoudness {
  loudnessLufs: number | null | undefined;
  albumLoudnessLufs: number | null | undefined;
  truePeakDb: number | null | undefined;
}

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

/**
 * The full leveling adjustment (dB) for a track: mode picks the reference
 * (album mode falls back per-track to the track measurement wherever no album
 * value exists — the untagged pile and pre-F5 rows keep leveling), then the
 * true-peak guard caps any *boost* so the result cannot push the signal past
 * [`TRUE_PEAK_CEILING_DB`]. Tracks with no stored peak (v1-era analysis,
 * silence) boost unguarded, exactly as before F5.
 */
export function computeLevelingGainDb(
  track: TrackLoudness | null,
  mode: LoudnessLevelingMode,
  targetLufs: number
): number {
  if (!track) return 0;

  const albumReference =
    track.albumLoudnessLufs != null && Number.isFinite(track.albumLoudnessLufs)
      ? track.albumLoudnessLufs
      : null;
  const reference =
    mode === 'album' && albumReference != null ? albumReference : track.loudnessLufs;

  let gain = computeLoudnessGainDb(reference, targetLufs);

  const peak = track.truePeakDb;
  if (gain > 0 && peak != null && Number.isFinite(peak)) {
    gain = Math.min(gain, Math.max(0, TRUE_PEAK_CEILING_DB - peak));
  }

  return gain;
}

/** Convert a decibel value to a linear amplitude multiplier. */
export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}
