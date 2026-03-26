import { useQuery } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import type { WatchedFolder } from '@/components/settings/MusicFoldersSection';

export const folderKeys = {
  all: ['folders'] as const,
};

export function useFoldersQuery() {
  return useQuery({
    queryKey: folderKeys.all,
    queryFn: async () => {
      if (!IS_ELECTRON) return [];
      return (await window.electronAPI.db.folders.getAll()) as WatchedFolder[];
    },
    enabled: IS_ELECTRON,
  });
}
