import type { Rect } from '@/lib/player-stage';

/** Where the mini player sits on screen, in window coordinates. */
export interface MiniPlayerSpot {
  /** The artwork tile. */
  art: Rect;
  /** The whole mini player row. */
  row: Rect;
}

type Measure = () => Promise<MiniPlayerSpot | null>;

let measure: Measure | null = null;

/**
 * The mini player registers how to measure itself, so the player can grow
 * out of it and shrink back into it. Returns the unregister function.
 */
export function registerMiniPlayer(next: Measure): () => void {
  measure = next;
  return () => {
    if (measure === next) measure = null;
  };
}

/** A transition never waits longer than this for the measurement. */
export const MINI_MEASURE_TIMEOUT_MS = 120;

/**
 * The mini player's spot right now, or null when it is not on screen (the
 * queue was cleared) or does not answer in time.
 */
export function measureMiniPlayer(
  timeoutMs: number = MINI_MEASURE_TIMEOUT_MS
): Promise<MiniPlayerSpot | null> {
  if (!measure) return Promise.resolve(null);
  const current = measure;
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    current()
      .then(spot => resolve(spot && spot.art.width > 0 ? spot : null))
      .catch(() => resolve(null))
      .finally(() => clearTimeout(timer));
  });
}
