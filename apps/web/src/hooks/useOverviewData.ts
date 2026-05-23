import { useCallback, useMemo } from 'react';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useHistoryQuery } from '@/hooks/queries/useHistory';
import { EMPTY_SUMMARY } from '@/components/history/historyUtils';
import type { Track } from '@/stores/types';

/** How many recently-added tracks the carousel shows. */
const RECENTS_LIMIT = 12;

/**
 * Composes the Overview's data from the library store + the shared History
 * query (windowed to the last 7 days). The 7d query key is the same one
 * `useHistoryQuery` uses, so Overview and History warm each other's cache for
 * free — no duplicate fetch when navigating between them.
 *
 * "Recently added" is purely client-side: the full library already lives in
 * the Zustand store, so we sort by `createdAt` and slice. No backend call.
 */
export function useOverviewData() {
  const library = useLibraryStore(s => s.library);
  const libraryLoaded = useLibraryStore(s => s.libraryLoaded);
  const setQueue = usePlaybackStore(s => s.setQueue);

  const { data, isLoading, isError, refetch } = useHistoryQuery('7d');

  const summary = data?.summary ?? EMPTY_SUMMARY;

  const recentlyAdded = useMemo<Track[]>(() => {
    return [...library]
      .filter(track => Boolean(track.createdAt))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, RECENTS_LIMIT);
  }, [library]);

  const handlePlayTrack = useCallback(
    (trackId: string) => {
      const index = library.findIndex(track => track.id === trackId);
      if (index >= 0) setQueue(library, index);
    },
    [library, setQueue]
  );

  const hasLibrary = library.length > 0;
  const hasHistory = summary.totalPlays > 0;

  return {
    summary,
    recentlyAdded,
    library,
    hasLibrary,
    hasHistory,
    libraryLoaded,
    isLoading,
    isError,
    refetch,
    handlePlayTrack,
  };
}
