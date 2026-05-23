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
  WeeklyInsights,
} from '@/types/electron';

/** Stats only change when a play is recorded, so navigating away and back
 *  should not refetch — a 15-minute stale window matches the weather cadence
 *  and keeps Overview↔Library↔History snappy. */
const STATS_STALE_MS = 15 * 60 * 1000;

export const historyKeys = {
  all: ['history'] as const,
  data: (range: HistoryRange) => ['history', range] as const,
  hourly: (range: HistoryRange) => ['history', 'hourly', range] as const,
  insights: (range: HistoryRange) => ['history', 'insights', range] as const,
  priorWindow: (since: string, until: string) => ['history', 'prior-window', since, until] as const,
};

const EMPTY_INSIGHTS: WeeklyInsights = { sessionCount: 0, topAlbums: [] };

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

export function useWeeklyInsightsQuery(range: HistoryRange) {
  return useQuery({
    queryKey: historyKeys.insights(range),
    queryFn: async (): Promise<WeeklyInsights> => {
      if (!IS_ELECTRON) return EMPTY_INSIGHTS;
      const since = getSinceForRange(range);
      return window.electronAPI.db.history.getWeeklyInsights({ since });
    },
    enabled: IS_ELECTRON,
    staleTime: STATS_STALE_MS,
  });
}

/** The 7-day window immediately preceding the current one (for the trend). */
function getPriorWeekWindow(): { since: string; until: string } {
  const until = new Date();
  until.setHours(0, 0, 0, 0);
  until.setDate(until.getDate() - 6);
  const since = new Date(until);
  since.setDate(since.getDate() - 7);
  return { since: since.toISOString(), until: until.toISOString() };
}

/** Total listened minutes for the prior 7-day window — powers the trend delta. */
export function usePriorWeekMinutesQuery() {
  const { since, until } = getPriorWeekWindow();
  return useQuery({
    queryKey: historyKeys.priorWindow(since, until),
    queryFn: async (): Promise<number> => {
      if (!IS_ELECTRON) return 0;
      const summary = await window.electronAPI.db.history.getSummary({ since, until });
      return summary.totalMinutes;
    },
    enabled: IS_ELECTRON,
    staleTime: STATS_STALE_MS,
  });
}
