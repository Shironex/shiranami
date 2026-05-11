/**
 * Maps a metadata-match confidence score (0-1) to a coarse level used for the
 * confidence badge. Thresholds per the 2026-05-04 research doc:
 *   - >= 0.8  High
 *   - 0.5 .. 0.8  Med
 *   - < 0.5  Low
 *
 * `undefined` (no match / no score) maps to `null` so callers can skip the
 * badge entirely.
 */
export type ConfidenceLevel = 'low' | 'med' | 'high';

export function confidenceLevel(score: number | undefined | null): ConfidenceLevel | null {
  if (score === undefined || score === null || Number.isNaN(score)) return null;
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'med';
  return 'low';
}
