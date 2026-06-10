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
 * tasks settle but their results are discarded.
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

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= total) return;
      results[i] = await fn(items[i], i);
    }
  }

  const poolSize = Math.max(1, Math.min(limit, total));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  return results;
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
