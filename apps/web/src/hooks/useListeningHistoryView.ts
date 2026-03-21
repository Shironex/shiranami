import { useCallback, useEffect, useMemo, useState } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { subscribeToListeningHistoryUpdates } from '@/lib/listeningHistory';
import { usePlayerStore } from '@/stores/usePlayerStore';
import type { ListeningActivityPoint, ListeningHistoryEntry, ListeningStatsSummary } from '@/types/electron';
import {
  buildActivitySeries,
  EMPTY_SUMMARY,
  getSinceForRange,
  type HistoryRange,
} from '@/components/history/historyUtils';

export type { HistoryRange } from '@/components/history/historyUtils';

export function useListeningHistoryView() {
  const library = usePlayerStore((s) => s.library);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const [selectedRange, setSelectedRange] = useState<HistoryRange>('all');
  const [summary, setSummary] = useState<ListeningStatsSummary>(EMPTY_SUMMARY);
  const [recent, setRecent] = useState<ListeningHistoryEntry[]>([]);
  const [activity, setActivity] = useState<ListeningActivityPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistoryData = useCallback(async () => {
    if (!IS_ELECTRON) {
      setSummary(EMPTY_SUMMARY);
      setRecent([]);
      setActivity([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const since = getSinceForRange(selectedRange);

    try {
      const [nextSummary, nextRecent, nextActivity] = await Promise.all([
        window.electronAPI.db.history.getSummary({ since }),
        window.electronAPI.db.history.getRecent({ limit: 25, since }),
        window.electronAPI.db.history.getActivity({ since }),
      ]);

      setSummary(nextSummary);
      setRecent(nextRecent);
      setActivity(nextActivity);
    } catch {
      setSummary(EMPTY_SUMMARY);
      setRecent([]);
      setActivity([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedRange]);

  useEffect(() => {
    void loadHistoryData();
    return subscribeToListeningHistoryUpdates(() => {
      void loadHistoryData();
    });
  }, [loadHistoryData]);

  const handlePlayTrack = useCallback(
    (trackId: string) => {
      const index = library.findIndex((track) => track.id === trackId);
      if (index >= 0) {
        setQueue(library, index);
      }
    },
    [library, setQueue],
  );

  const activitySeries = useMemo(
    () => buildActivitySeries(selectedRange, activity),
    [selectedRange, activity],
  );

  return {
    selectedRange,
    setSelectedRange,
    summary,
    recent,
    activitySeries,
    isLoading,
    handlePlayTrack,
  };
}
