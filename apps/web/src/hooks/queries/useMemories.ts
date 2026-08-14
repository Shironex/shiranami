import { useQuery } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import type { ListeningStatsTrack } from '@/types/electron';

/** How far each side of the anniversary night the lookup reaches. */
const MEMORY_WINDOW_DAYS = 3;

/** How far back a memory looks: this night a year ago, else six months. */
export type MemoryDistance = 'year' | 'halfYear';

export interface MemoryWindow {
  distance: MemoryDistance;
  /** The anniversary night itself, in local time. */
  anchor: Date;
  /** Closed-open `[since, until)` query bounds around the anchor. */
  since: string;
  until: string;
}

/** An "on this night" memory: the most-played track of an anniversary window. */
export interface OnThisNightMemory {
  distance: MemoryDistance;
  /** ISO timestamp of the anniversary night the window centers on. */
  anchorIso: string;
  track: ListeningStatsTrack;
  /** Every play inside the window, not just the remembered track's. */
  totalPlays: number;
}

function makeWindow(now: Date, distance: MemoryDistance, monthsBack: number): MemoryWindow {
  const anchor = new Date(now);
  anchor.setMonth(anchor.getMonth() - monthsBack);
  const since = new Date(anchor);
  since.setDate(since.getDate() - MEMORY_WINDOW_DAYS);
  const until = new Date(anchor);
  until.setDate(until.getDate() + MEMORY_WINDOW_DAYS);
  return { distance, anchor, since: since.toISOString(), until: until.toISOString() };
}

/** The lookback windows in preference order: a year ago first, then six months. */
export function getMemoryWindows(now: Date): MemoryWindow[] {
  return [makeWindow(now, 'year', 12), makeWindow(now, 'halfYear', 6)];
}

/** Local calendar day, so the memory rolls over at midnight — not per render. */
function localDayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export const memoryKeys = {
  onThisNight: (dayKey: string) => ['history', 'memories', dayKey] as const,
};

/**
 * The Overview "on this night" memory: the top track of the ±3-day window
 * around this night a year ago, falling back to six months when the year-old
 * window is silent, and `null` when both are. The key is day-stamped (a new
 * night is a new memory) and nested under `['history']` so recording a play
 * invalidates it with every other history read.
 */
export function useOnThisNightQuery(enabled: boolean) {
  const dayKey = localDayKey(new Date());
  return useQuery({
    queryKey: memoryKeys.onThisNight(dayKey),
    enabled: IS_ELECTRON && enabled,
    staleTime: Infinity,
    queryFn: async (): Promise<OnThisNightMemory | null> => {
      if (!IS_ELECTRON) return null;

      for (const lookback of getMemoryWindows(new Date())) {
        const summary = await window.electronAPI.db.history.getSummary({
          since: lookback.since,
          until: lookback.until,
        });
        const track = summary.topTracks[0];
        if (track) {
          return {
            distance: lookback.distance,
            anchorIso: lookback.anchor.toISOString(),
            track,
            totalPlays: summary.totalPlays,
          };
        }
      }

      return null;
    },
  });
}
