import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';
import { formatDuration } from '@shiranami/shared';
import type { ITimeDisplayView } from './TimeDisplay.types';

/** Subscribes to currentTime/scrubTime in isolation so the parent player does
 *  not re-render on every per-second time update. */
export function useTimeDisplay(): ITimeDisplayView {
  const currentTime = usePlaybackStore(s => s.currentTime);
  const scrubTime = usePlayerUIStore(s => s.scrubTime);
  return { time: formatDuration(scrubTime ?? currentTime) };
}
