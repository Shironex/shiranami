import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';
import type { LyricLine } from '@/hooks/queries/useLyrics';

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
