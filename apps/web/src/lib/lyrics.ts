import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { LyricLine } from '@/hooks/queries/useLyrics';

export function findActiveLine(lines: Array<{ time: number }>, currentTime: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}

export function useActiveLineIndex(lines: LyricLine[] | null | undefined): number {
  return usePlaybackStore(s =>
    lines && lines.length > 0 ? findActiveLine(lines, s.currentTime) : -1
  );
}

/** An instrumental stretch must be at least this long to earn breathing dots. */
export const INSTRUMENTAL_GAP_MIN_SECONDS = 6;
/**
 * How long after a line's timestamp the dots wait before appearing — the line
 * needs its moment to actually be sung before the stage reads as instrumental.
 */
export const INSTRUMENTAL_GAP_LEAD_SECONDS = 2.5;

/**
 * Whether playback currently sits inside an instrumental gap: the stretch
 * between the active line and the next one (or before the first line) is six
 * seconds or longer, and enough of it has elapsed that nothing is being sung.
 * The stretch after the LAST timestamp never counts — its length is unknown.
 */
export function isInstrumentalGap(
  lines: Array<{ time: number }> | null,
  activeIndex: number,
  currentTime: number
): boolean {
  if (!lines || lines.length === 0) return false;

  // Intro: before the first line, measured from 0. (activeIndex -1 always has
  // a "next" — lines[0] — because the empty list bailed above.)
  const start = activeIndex >= 0 ? lines[activeIndex].time : 0;
  const next = activeIndex + 1 < lines.length ? lines[activeIndex + 1] : undefined;
  // No known end (past the last line): the outro's length is unknowable.
  if (next === undefined) return false;
  const end = next.time;

  if (end - start < INSTRUMENTAL_GAP_MIN_SECONDS) return false;
  const lead = activeIndex >= 0 ? INSTRUMENTAL_GAP_LEAD_SECONDS : 1;
  return currentTime >= start + lead && currentTime < end;
}

/** Store-subscribed variant of `isInstrumentalGap` (re-renders only on flips). */
export function useInstrumentalGap(lines: LyricLine[] | null, activeIndex: number): boolean {
  return usePlaybackStore(s => isInstrumentalGap(lines, activeIndex, s.currentTime));
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
/** Floor for back-to-back timestamps, so the animation never divides by zero. */
const KARAOKE_MIN_SLOT_SECONDS = 0.1;

/**
 * How long the karaoke animation of line `index` runs, in seconds. Normally
 * the gap to the next timestamp; the last line and lines followed by a long
 * instrumental gap use a text-length estimate instead (never longer than the
 * gap itself). LRC carries no word timing, so this is the whole budget.
 */
export function karaokeLineDuration(
  lines: ReadonlyArray<{ time: number; text: string }>,
  index: number
): number {
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

/** How far playback sits into a line, clamped to the animation's span. */
export function karaokeElapsed(currentTime: number, lineTime: number, duration: number): number {
  return Math.min(duration, Math.max(0, currentTime - lineTime));
}

/** One piece of a line: a word with its slice of the line, or the whitespace between. */
export interface KaraokeToken {
  readonly text: string;
  readonly isWord: boolean;
  /** Seconds from the line's start until this word begins. */
  readonly start: number;
  /** Seconds this word takes. */
  readonly duration: number;
}

/**
 * Splits a line into words and the whitespace between them, giving each word
 * a start time and duration proportional to its character length. Words run
 * back to back, so the first starts at 0 and the last ends at `lineDuration`.
 * Joining every token's text gives back the original line.
 */
export function karaokeTokens(text: string, lineDuration: number): KaraokeToken[] {
  const parts = text.split(/(\s+)/).filter(part => part.length > 0);
  const totalChars = parts.reduce((sum, part) => (/\S/.test(part) ? sum + part.length : sum), 0);

  let cursor = 0;
  return parts.map(part => {
    if (!/\S/.test(part)) {
      return { text: part, isWord: false, start: 0, duration: 0 };
    }
    const start = (cursor / totalChars) * lineDuration;
    cursor += part.length;
    return {
      text: part,
      isWord: true,
      start,
      duration: (part.length / totalChars) * lineDuration,
    };
  });
}
