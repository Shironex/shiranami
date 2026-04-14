import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { mapDbTracksToTracks } from '@/lib/trackMapper';
import { libraryKeys } from '@/hooks/queries/useLibrary';

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
    const current = usePlayerStore.getState();
    if (current.library.length === 0) {
      usePlayerStore.setState({ library: data });
    }
    if (current.queue.length === 0) {
      usePlayerStore.setState({ queue: data });
    }
  }, [data]);

  // Flip `libraryLoaded` once the query settles (success, empty, or error) so
  // views can swap from skeleton to content/empty-state. In non-Electron mode
  // the query is disabled, so mark loaded immediately.
  useEffect(() => {
    if (!IS_ELECTRON) {
      usePlayerStore.setState({ libraryLoaded: true });
      return;
    }
    if (isLoading) return;
    usePlayerStore.setState({ libraryLoaded: true });
  }, [isLoading]);

  return { isLoading, isError, error, refetch };
}
