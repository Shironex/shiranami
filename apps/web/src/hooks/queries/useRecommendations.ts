import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RecommendationShelves } from '@shiranami/contracts';
import { IS_ELECTRON } from '@/lib/platform';

/** Recommendations come from a precomputed cache; a 15-minute stale window
 *  matches the other Overview queries so navigating away and back is snappy.
 *  The discover shelf is refreshed by a background job in main, not here. */
const RECOMMENDATIONS_STALE_MS = 15 * 60 * 1000;

const EMPTY_SHELVES: RecommendationShelves = {
  library: { kind: 'library', items: [], generatedAt: null, stale: true },
  discover: { kind: 'discover', items: [], generatedAt: null, stale: true },
};

export const recommendationKeys = {
  all: ['recommendations'] as const,
};

/**
 * Reads both recommendation shelves from the desktop cache (read-only over
 * IPC) and exposes a manual refresh that runs the background job in main
 * (affinity + yt-dlp RD-mix) and writes the result back into the query cache.
 *
 * Always resolves — the main-process handlers degrade to empty shelves on any
 * failure, and outside Electron the query short-circuits to empty — so the
 * shelf never errors out the home view.
 */
export function useRecommendations() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: recommendationKeys.all,
    queryFn: async (): Promise<RecommendationShelves> => {
      if (!IS_ELECTRON) return EMPTY_SHELVES;
      return window.electronAPI.recommendations.get();
    },
    enabled: IS_ELECTRON,
    staleTime: RECOMMENDATIONS_STALE_MS,
  });

  const refresh = useMutation({
    mutationFn: async (): Promise<RecommendationShelves> => {
      if (!IS_ELECTRON) return EMPTY_SHELVES;
      return window.electronAPI.recommendations.refresh();
    },
    onSuccess: shelves => {
      queryClient.setQueryData(recommendationKeys.all, shelves);
    },
  });

  const shelves = query.data ?? EMPTY_SHELVES;

  return {
    library: shelves.library,
    discover: shelves.discover,
    isLoading: query.isLoading,
    isRefreshing: refresh.isPending,
    refresh: refresh.mutate,
    hasAny: shelves.library.items.length > 0 || shelves.discover.items.length > 0,
  };
}
