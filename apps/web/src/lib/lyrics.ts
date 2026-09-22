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
