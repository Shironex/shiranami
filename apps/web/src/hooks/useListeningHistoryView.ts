import { useCallback, useMemo, useState } from 'react';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useHistoryQuery } from '@/hooks/queries/useHistory';
import {
  buildActivitySeries,
  EMPTY_SUMMARY,
  type HistoryRange,
} from '@/components/history/historyUtils';

export type { HistoryRange } from '@/components/history/historyUtils';

export function useListeningHistoryView() {
  const library = useLibraryStore((s) => s.library);
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const [selectedRange, setSelectedRange] = useState<HistoryRange>('all');

  const { data, isLoading, isError, refetch } = useHistoryQuery(selectedRange);

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
    isError,
    refetch,
    handlePlayTrack,
  };
}
