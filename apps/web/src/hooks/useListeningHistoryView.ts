import { useCallback, useMemo, useState } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useHistoryQuery } from '@/hooks/queries/useHistory';
import {
  buildActivitySeries,
  EMPTY_SUMMARY,
  type HistoryRange,
} from '@/components/history/historyUtils';

export type { HistoryRange } from '@/components/history/historyUtils';

export function useListeningHistoryView() {
  const library = usePlayerStore((s) => s.library);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const [selectedRange, setSelectedRange] = useState<HistoryRange>('all');

  const { data, isLoading } = useHistoryQuery(selectedRange);

  const summary = data?.summary ?? EMPTY_SUMMARY;
  const recent = data?.recent ?? [];
  const activity = data?.activity ?? [];

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
