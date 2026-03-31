import { memo } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { formatDuration } from '@shiranami/shared';

/** Isolated component that subscribes to currentTime/scrubTime so
 *  the parent player doesn't re-render on every time update. */
export const TimeDisplay = memo(function TimeDisplay() {
  const currentTime = usePlayerStore(s => s.currentTime);
  const scrubTime = usePlayerStore(s => s.scrubTime);
  return <>{formatDuration(scrubTime ?? currentTime)}</>;
});
