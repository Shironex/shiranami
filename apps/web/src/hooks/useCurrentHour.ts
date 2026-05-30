import { useEffect, useState } from 'react';

/** Re-check the clock once a minute; only the hour boundary actually matters. */
const TICK_MS = 60 * 1000;

/**
 * The current local hour (0-23), backed by a timer so it rolls forward on its
 * own while a component stays mounted across an hour boundary.
 *
 * Polls every ~60s and only updates state when the hour actually changes, so
 * long-lived consumers (e.g. time-of-day query keys) advance on schedule
 * without forcing a rerender every tick.
 */
export function useCurrentHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const id = setInterval(() => {
      const next = new Date().getHours();
      setHour(prev => (prev === next ? prev : next));
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return hour;
}
