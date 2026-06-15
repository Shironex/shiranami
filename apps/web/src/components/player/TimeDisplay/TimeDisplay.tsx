import { memo } from 'react';
import { useTimeDisplay } from './TimeDisplay.hooks';

/** Isolated current-time readout. Memoized so a parent re-render alone does not
 *  re-render it — only its own currentTime/scrubTime subscription does. */
function TimeDisplay() {
  const { time } = useTimeDisplay();
  return <>{time}</>;
}

export default memo(TimeDisplay);
