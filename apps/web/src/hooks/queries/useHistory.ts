import { useQuery } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import { getSinceForRange, EMPTY_SUMMARY, type HistoryRange } from '@/components/history/historyUtils';
import type { ListeningActivityPoint, ListeningHistoryEntry, ListeningStatsSummary } from '@/types/electron';

export const historyKeys = {
  all: ['history'] as const,
  data: (range: HistoryRange) => ['history', range] as const,
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
  });
}
