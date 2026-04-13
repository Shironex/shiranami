import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import type { WatchedFolder } from '@/components/settings/MusicFoldersSection';
import { libraryKeys } from '@/hooks/queries/useLibrary';

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

export function useAddFolderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (path: string) => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.db.folders.add(path);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useRemoveFolderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.db.folders.remove(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useUpdateFolderScannedMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.db.folders.updateScanned(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}
