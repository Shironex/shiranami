import { memo } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';
import { formatDuration } from '@shiranami/shared';

/** Isolated component that subscribes to currentTime/scrubTime so
 *  the parent player doesn't re-render on every time update. */
export const TimeDisplay = memo(function TimeDisplay() {
  const currentTime = usePlaybackStore(s => s.currentTime);
  const scrubTime = usePlayerUIStore(s => s.scrubTime);
  return <>{formatDuration(scrubTime ?? currentTime)}</>;
});
