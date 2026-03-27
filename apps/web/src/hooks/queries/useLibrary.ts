import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { mapDbTracksToTracks } from '@/lib/trackMapper';

export const libraryKeys = {
  all: ['library'] as const,
};

/**
 * Hybrid approach: TanStack Query handles the initial DB fetch,
 * but Zustand remains the runtime source of truth for library/queue/currentTrack.
 *
 * TQ is used for:
 * - Initial load with loading/error states
 * - Safety-net invalidation after mutations (staleTime: Infinity means no automatic refetch)
 *
 * Zustand continues to own:
 * - library[], queue[], currentTrack (all mutations update these directly)
 */
export function useLibraryQuery() {
  const { data, isLoading } = useQuery({
    queryKey: libraryKeys.all,
    queryFn: async () => {
      if (!IS_ELECTRON) return [];
      const dbTracks = await window.electronAPI.db.tracks.getAll();
      if (!dbTracks || dbTracks.length === 0) return [];
      return mapDbTracksToTracks(dbTracks as Record<string, unknown>[]);
    },
    enabled: IS_ELECTRON,
    staleTime: Infinity, // we control mutations — no automatic refetch needed
  });

  // Seed Zustand when data arrives (only if empty, to avoid overwriting runtime state)
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

  return { isLoading };
}
