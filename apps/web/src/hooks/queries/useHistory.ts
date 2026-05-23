import { useQuery } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import {
  getSinceForRange,
  EMPTY_SUMMARY,
  type HistoryRange,
} from '@/components/history/historyUtils';
import type {
  ListeningActivityPoint,
  ListeningHistoryEntry,
  ListeningHourlyActivityPoint,
  ListeningStatsSummary,
} from '@/types/electron';

/** Stats only change when a play is recorded, so navigating away and back
 *  should not refetch — a 15-minute stale window matches the weather cadence
 *  and keeps Overview↔Library↔History snappy. */
const STATS_STALE_MS = 15 * 60 * 1000;

export const historyKeys = {
  all: ['history'] as const,
  data: (range: HistoryRange) => ['history', range] as const,
  hourly: (range: HistoryRange) => ['history', 'hourly', range] as const,
  summaryWindow: (since: string | null, until: string | null) =>
    ['history', 'summary-window', since, until] as const,
};

export interface HistoryData {
  summary: ListeningStatsSummary;
  recent: ListeningHistoryEntry[];
  activity: ListeningActivityPoint[];
}

export function useHistoryQuery(range: HistoryRange) {
  return useQuery({
    queryKey: historyKeys.data(range),
    queryFn: async (): Promise<HistoryData> => {
      if (!IS_ELECTRON) {
        return { summary: EMPTY_SUMMARY, recent: [], activity: [] };
      }

      const since = getSinceForRange(range);
      const [summary, recent, activity] = await Promise.all([
        window.electronAPI.db.history.getSummary({ since }),
        window.electronAPI.db.history.getRecent({ limit: 25, since }),
        window.electronAPI.db.history.getActivity({ since }),
      ]);

      return { summary, recent, activity };
    },
    enabled: IS_ELECTRON,
    staleTime: STATS_STALE_MS,
  });
}

export function useHourlyActivityQuery(range: HistoryRange) {
  return useQuery({
    queryKey: historyKeys.hourly(range),
    queryFn: async (): Promise<ListeningHourlyActivityPoint[]> => {
      if (!IS_ELECTRON) return [];
      const since = getSinceForRange(range);
      return window.electronAPI.db.history.getHourlyActivity({ since });
    },
    enabled: IS_ELECTRON,
    staleTime: STATS_STALE_MS,
  });
}
