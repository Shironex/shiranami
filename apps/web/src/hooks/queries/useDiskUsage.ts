import { useQuery } from '@tanstack/react-query';
import type { DiskUsageResult } from '@shiranami/contracts';
import { IS_ELECTRON } from '@/lib/platform';
import { useFoldersQuery } from '@/hooks/queries/useFolders';

export const diskUsageKeys = {
  /** Prefix for invalidation — matches every path-specific key below. */
  all: ['disk-usage'] as const,
  forPaths: (paths: string[]) => ['disk-usage', ...paths] as const,
};

/**
 * Disk usage for the watched library folders, grouped by physical volume.
 *
 * The query key embeds the (sorted) folder paths, so adding/removing a folder
 * changes the key and refetches automatically. This TanStack Query cache IS the
 * cache — there is no main-side cache — so `staleTime` controls how often the
 * O(files) FS walk actually runs. Invalidate `diskUsageKeys.all` after a rescan
 * or download to recompute when bytes change but paths don't; the panel's manual
 * refresh button calls `refetch()` directly.
 */
export function useDiskUsageQuery() {
  const { data: folders = [] } = useFoldersQuery();
  const folderPaths = folders.map(f => f.path).sort();

  return useQuery({
    queryKey: diskUsageKeys.forPaths(folderPaths),
    queryFn: async (): Promise<DiskUsageResult> => {
      return window.electronAPI.storage.getUsage(folderPaths);
    },
    enabled: IS_ELECTRON && folderPaths.length > 0,
    staleTime: 30_000,
  });
}
