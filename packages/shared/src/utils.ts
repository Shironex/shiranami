/**
 * Truncate a string to a maximum length, appending an ellipsis if truncated.
 */
export function truncate(text: string, max: number, ellipsis = '...'): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max <= ellipsis.length) return ellipsis.slice(0, max);
  return text.slice(0, max - ellipsis.length) + ellipsis;
}

/**
 * Clamp a number to the inclusive [min, max] range. A non-finite `value`
 * (`NaN`, `±Infinity`) collapses to `min` rather than propagating — callers use
 * this to keep a malformed input (a corrupt DB row, a divide-by-zero ratio,
 * `audio.volume = NaN`) from poisoning the result downstream.
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamp a number to the inclusive [0, 1] range.
 */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Map over `items` with a bounded number of concurrent `fn` invocations.
 *
 * A pool of `limit` workers pulls from a shared cursor, so up to `limit`
 * tasks stay continuously in flight — unlike `Promise.all` over fixed
 * chunks, where the slowest item in each chunk gates the next batch.
 *
 * Results are returned in input order regardless of completion order. The
 * first rejection propagates (matching `Promise.all`); remaining in-flight
 * tasks settle but their results are discarded, and no further items are
 * started once a failure has been observed.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const total = items.length;
  const results = new Array<R>(total);
  if (total === 0) return results;

  let nextIndex = 0;
  let hasFailed = false;

  async function worker(): Promise<void> {
    while (!hasFailed) {
      const i = nextIndex++;
      if (i >= total) return;
      try {
        results[i] = await fn(items[i], i);
      } catch (error) {
        hasFailed = true;
        throw error;
      }
    }
  }

  const poolSize = Math.max(1, Math.min(limit, total));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  return results;
}

/**
 * Split `items` into consecutive sub-arrays of at most `size` elements,
 * preserving order. Used to batch bulk SQLite reads/writes so a single
 * statement stays under the bound-parameter limit. `size` is coerced to a
 * whole number >= 1 so a malformed caller (`0`, a fraction, `NaN`) degrades to
 * one-item-per-chunk rather than looping forever on a zero/negative step.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  // Math.floor(NaN) is NaN and Math.max(1, NaN) is NaN, so floor only after
  // clamping the low bound — keeps a NaN/0/negative `size` at exactly 1.
  const step = Math.floor(Math.max(1, size)) || 1;
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += step) {
    result.push(items.slice(i, i + step));
  }
  return result;
}

/**
 * Zero-pad a number to two digits (e.g. `5` -> `"05"`). Used for clock/duration
 * fields where single digits must align (`09:00`, `1:05:09`).
 */
export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Format duration in seconds to mm:ss or hh:mm:ss string.
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const sPad = pad2(s);
  if (h > 0) {
    return `${h}:${pad2(m)}:${sPad}`;
  }
  return `${m}:${sPad}`;
}

/**
 * Format an estimated tempo for display, e.g. `128.4` -> `"128 BPM"`. Rounds to
 * a whole number — sub-BPM precision is noise to a listener. Returns `null` for
 * an unanalysed/undetectable tempo so callers can omit the field entirely.
 */
export function formatBpm(bpm: number | null | undefined): string | null {
  if (bpm == null || !isFinite(bpm) || bpm <= 0) return null;
  return `${Math.round(bpm)} BPM`;
}

/**
 * Format a musical key for display. The native addon already produces a
 * display-ready string (e.g. `'A minor'`); this just normalises an
 * empty/unanalysed value to `null` so callers can omit the field.
 */
export function formatMusicalKey(key: string | null | undefined): string | null {
  const trimmed = key?.trim();
  return trimmed ? trimmed : null;
}
