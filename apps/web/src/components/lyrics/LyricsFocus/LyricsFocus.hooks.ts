import { useUIStore } from '@/stores/useUIStore';
import { useInstrumentalGap } from '@/lib/lyrics';
import type { IFocusLine, ILyricsFocusProps, ILyricsFocusView } from './LyricsFocus.types';

const DEFAULT_WINDOW = 2;

export function useLyricsFocus({
  synced,
  activeLine,
  windowSize = DEFAULT_WINDOW,
}: ILyricsFocusProps): ILyricsFocusView {
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const showBreathingDots = useInstrumentalGap(synced, activeLine);

  // Before the first timestamp the stage centers on the upcoming first line.
  const center = Math.max(activeLine, 0);
  const first = Math.max(0, center - windowSize);
  const last = Math.min(synced.length - 1, center + windowSize);

  const lines: IFocusLine[] = [];
  for (let index = first; index <= last; index++) {
    lines.push({
      index,
      text: synced[index].text,
      time: synced[index].time,
      isActive: index === activeLine,
      isPast: index < activeLine,
      distance: Math.abs(index - center),
    });
  }

  return {
    lines,
    showBreathingDots,
    // `filter: blur()` on live text is the expensive part of the underwater
    // look — low-perf keeps the depth metaphor with opacity alone.
    blurEnabled: !lowPerformanceMode,
  };
}
