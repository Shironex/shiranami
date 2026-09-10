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
