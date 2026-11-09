/**
 * Timing for synced lyrics: which line is sung, how its karaoke fill runs,
 * and where the list scrolls to keep it in view. Pure, so the lyrics card and
 * the full screen view share it and the tests can pin it down.
 */

export interface TimedLine {
  readonly time: number;
  readonly text: string;
}

/** Index of the line sung at `currentTime`, or -1 before the first line. */
export function activeLyricIndex(lines: readonly TimedLine[] | null, currentTime: number): number {
  if (!lines || lines.length === 0 || currentTime < lines[0].time) return -1;
  // Last line whose time has come; lines are sorted by time.
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid].time <= currentTime) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export type LyricLineState = 'past' | 'now' | 'next';

export function lyricLineState(index: number, active: number): LyricLineState {
  if (index === active) return 'now';
  return index < active ? 'past' : 'next';
}

/**
 * A line slot longer than this is read as singing plus an instrumental tail,
 * so the karaoke fill runs over a text-length estimate instead of the gap.
 */
export const KARAOKE_MAX_LINE_SECONDS = 8;
/** Rough singing pace used to size a capped line (and the last line). */
export const KARAOKE_SECONDS_PER_CHAR = 0.12;
/** Floor for a capped line's estimate, so short lines don't flash. */
export const KARAOKE_MIN_LINE_SECONDS = 1.5;
/** Floor for back to back timestamps, so the fill never divides by zero. */
const KARAOKE_MIN_SLOT_SECONDS = 0.1;

/**
 * How long the karaoke fill of line `index` runs, in seconds. Normally the gap
 * to the next timestamp; the last line and lines followed by a long
 * instrumental gap use a text-length estimate instead (never longer than the
 * gap itself). LRC carries no word timing, so this is the whole budget.
 */
export function karaokeLineDuration(lines: readonly TimedLine[], index: number): number {
  const line = lines[index];
  const next = lines[index + 1];
  const gap = next ? next.time - line.time : Infinity;
  if (gap <= KARAOKE_MAX_LINE_SECONDS) return Math.max(gap, KARAOKE_MIN_SLOT_SECONDS);

  const estimate = Math.min(
    KARAOKE_MAX_LINE_SECONDS,
    Math.max(KARAOKE_MIN_LINE_SECONDS, line.text.length * KARAOKE_SECONDS_PER_CHAR)
  );
  return Math.min(gap, estimate);
}

/** How far playback sits into a line, clamped to the fill's span. */
export function karaokeElapsed(currentTime: number, lineTime: number, duration: number): number {
  return Math.min(duration, Math.max(0, currentTime - lineTime));
}

/** One word of a line with its slice of the line's time. */
export interface KaraokeWord {
  readonly text: string;
  /** Seconds from the line's start until this word begins. */
  readonly start: number;
  /** Seconds this word takes. */
  readonly duration: number;
}

/**
 * Splits a line into words, giving each a start and a duration proportional
 * to its length. Words run back to back: the first starts at 0 and the last
 * ends at `lineDuration`.
 */
export function karaokeWords(text: string, lineDuration: number): KaraokeWord[] {
  const words = text.split(/\s+/).filter(word => word.length > 0);
  const totalChars = words.reduce((sum, word) => sum + word.length, 0);
  let cursor = 0;
  return words.map(word => {
    const start = (cursor / totalChars) * lineDuration;
    cursor += word.length;
    return { text: word, start, duration: (word.length / totalChars) * lineDuration };
  });
}

/** How far the fill of one word has run, 0 to 1, `elapsed` seconds into its line. */
export function karaokeWordProgress(word: KaraokeWord, elapsed: number): number {
  'worklet';
  if (word.duration <= 0) return elapsed >= word.start ? 1 : 0;
  return Math.min(1, Math.max(0, (elapsed - word.start) / word.duration));
}

/**
 * The fill runs on its own clock between store updates. When the player's
 * position strays further than this from where the fill thinks it is (a
 * seek, a stall while buffering), the fill restarts from the real position.
 */
export const KARAOKE_DRIFT_SECONDS = 0.35;

/**
 * Whether the fill of a line should restart from `currentTime`. `elapsed` is
 * where the fill is now. A fill that already finished stays finished while
 * playback is past the line.
 */
export function karaokeNeedsResync(
  elapsed: number,
  currentTime: number,
  lineTime: number,
  duration: number
): boolean {
  const actual = karaokeElapsed(currentTime, lineTime, duration);
  return Math.abs(actual - elapsed) > KARAOKE_DRIFT_SECONDS;
}

/** Where the sung line sits in the list's viewport: a third of the way down. */
export const LYRIC_FOLLOW_ANCHOR = 1 / 3;
/** After the user scrolls by hand, following waits this long before taking over again. */
export const LYRIC_FOLLOW_RESUME_MS = 4000;

export interface RowLayout {
  y: number;
  height: number;
}

/**
 * Scroll offset that puts the middle of `row` at `anchor` of the viewport,
 * clamped to what the list can actually scroll.
 */
export function followScrollTarget(
  row: RowLayout,
  viewportHeight: number,
  contentHeight: number,
  anchor: number = LYRIC_FOLLOW_ANCHOR
): number {
  const ideal = row.y + row.height / 2 - viewportHeight * anchor;
  const max = Math.max(0, contentHeight - viewportHeight);
  return Math.min(max, Math.max(0, ideal));
}

/** Whether following is still paused after a hand scroll that ended at `endedAt`. */
export function followPaused(
  endedAt: number | null,
  now: number,
  resumeMs: number = LYRIC_FOLLOW_RESUME_MS
): boolean {
  return endedAt !== null && now - endedAt < resumeMs;
}
