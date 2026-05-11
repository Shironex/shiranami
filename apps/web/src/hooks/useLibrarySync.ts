import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import type { Track } from '@/stores/types';
import { mapDbTracksToTracks } from '@/lib/trackMapper';
import { libraryKeys } from '@/hooks/queries/useLibrary';
import { queryClient } from '@/lib/queryClient';

/**
 * Bootstraps Zustand's player store from the persisted DB library on cold start.
 *
 * Zustand is the runtime source of truth for `library`/`queue`/`currentTrack`.
 * TanStack Query owns the DB fetch lifecycle (loading/error, invalidation after
 * mutations). This hook is the single bridge that seeds Zustand once, and must
 * be mounted exactly once (from App.tsx).
 *
 * The `length === 0` guard is load-bearing: it protects Vite HMR (which
 * preserves Zustand state across reloads) and post-mutation refetches (which
 * should no-op since mutations write Zustand directly).
 */
export function useLibrarySync() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: libraryKeys.all,
    queryFn: async () => {
      if (!IS_ELECTRON) return [];
      const dbTracks = await window.electronAPI.db.tracks.getAll();
      if (!dbTracks || dbTracks.length === 0) return [];
      return mapDbTracksToTracks(dbTracks as Record<string, unknown>[]);
    },
    enabled: IS_ELECTRON,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!data || data.length === 0) return;
    if (useLibraryStore.getState().library.length === 0) {
      // Through the action so the mutation overlay is reconciled away — the
      // freshly-fetched array carries the latest DB-side isFavorite/playCount.
      useLibraryStore.getState().setLibrary(data);
    }
    // Drop the React-Query copy after seeding Zustand. Zustand is the runtime
    // source of truth; keeping the cache around is ~20 MB of dead state at 50k
    // tracks (and diverges from Zustand on every favorite/playCount mutation).
    // We set it to an empty array rather than removing the cache entry — that
    // would orphan the active observer here and trigger an immediate refetch
    // loop. With an empty array the entry stays, the observer stays stable,
    // and mutations elsewhere can still invalidateQueries() to re-fetch and
    // re-seed (this effect re-runs, then re-empties).
    queryClient.setQueryData<Track[]>(libraryKeys.all, []);
  }, [data]);

  // Flip `libraryLoaded` once the query settles (success, empty, or error) so
  // views can swap from skeleton to content/empty-state. In non-Electron mode
  // the query is disabled, so mark loaded immediately.
  useEffect(() => {
    if (!IS_ELECTRON) {
      useLibraryStore.setState({ libraryLoaded: true });
      return;
    }
    if (isLoading) return;
    useLibraryStore.setState({ libraryLoaded: true });
  }, [isLoading]);

  return { isLoading, isError, error, refetch };
}
