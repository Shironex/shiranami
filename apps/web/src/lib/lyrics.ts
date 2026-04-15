import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';
import type { LyricLine } from '@/hooks/queries/useLyrics';

// Note: `offsetSeconds` here is the *user-facing* sync nudge from the lyrics
// panel — positive values DELAY the active line (intuition: "lyrics are too
// early, push them later"). This is the opposite polarity of the LRC
// [offset:] tag, which parseLrc applies at parse time where a positive value
// shifts lyrics EARLIER per the LRC spec. The two operate in separate layers
// and do not conflict.
export function findActiveLine(
  lines: Array<{ time: number }>,
  currentTime: number,
  offsetSeconds = 0,
): number {
  const effective = currentTime - offsetSeconds;
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= effective) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}

export function useActiveLineIndex(lines: LyricLine[] | null | undefined): number {
  const offset = useAppStore((s) => s.lyricsOffsetSeconds);
  return usePlayerStore((s) =>
    lines && lines.length > 0 ? findActiveLine(lines, s.currentTime, offset) : -1,
  );
}
