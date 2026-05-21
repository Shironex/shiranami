import { useCallback, useState } from 'react';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { withToast } from '@/hooks/useToastMutation';
import { IS_ELECTRON } from '@/lib/platform';
import { acquireScanLock, releaseScanLock } from '@/lib/scanLock';
import { scanAndPersistFolder, type SubfolderGroup } from '@/lib/scanHelpers';
import { useFoldersQuery, useRemoveFolderMutation, folderKeys } from '@/hooks/queries/useFolders';
import { libraryKeys } from '@/hooks/queries/useLibrary';
import { usePlaylistsQuery } from '@/hooks/queries/usePlaylists';
import type { Playlist } from '@/types/electron';
import { useLibraryStore } from '@/stores/useLibraryStore';

export interface UseLibraryFoldersResult {
  isScanning: boolean;
  addFolder: () => Promise<void>;
  removeFolder: (id: string) => Promise<void>;
  detectedSubfolders: SubfolderGroup[];
  existingPlaylistNames: Set<string>;
  clearDetectedSubfolders: () => void;
}

export function useLibraryFolders(): UseLibraryFoldersResult {
  const queryClient = useQueryClient();
  const { data: folders = [] } = useFoldersQuery();
  const { data: playlists = [] } = usePlaylistsQuery();
  const removeFolderMutation = useRemoveFolderMutation();

  const scanState = useLibraryStore(s => s.scanState);
  const setScanState = useLibraryStore(s => s.setScanState);
  const resetScanProgress = useLibraryStore(s => s.resetScanProgress);
  const isScanning = scanState !== 'idle';

  const [detectedSubfolders, setDetectedSubfolders] = useState<SubfolderGroup[]>([]);
  const [existingPlaylistNames, setExistingPlaylistNames] = useState<Set<string>>(new Set());

  const clearDetectedSubfolders = useCallback(() => {
    setDetectedSubfolders([]);
  }, []);

  const addFolder = useCallback(async () => {
    if (!IS_ELECTRON || !acquireScanLock()) return;
    try {
      const dirPath = await window.electronAPI.dialog.openDirectory();
      if (!dirPath) {
        releaseScanLock();
        return;
      }

      const existing = folders.find(f => f.path === dirPath);
      if (existing) {
        toast.info(i18n.t('folderAlreadyExists', { ns: 'toast' }));
        releaseScanLock();
        return;
      }

      setScanState('scanning');
      try {
        const result = await scanAndPersistFolder(dirPath);

        if (result.empty) {
          toast.info(i18n.t('noAudioInFolder', { ns: 'toast' }));
          return;
        }

        if (result.allExisted) {
          toast.info(i18n.t('allTracksExist', { ns: 'toast' }));
          return;
        }

        queryClient.invalidateQueries({ queryKey: folderKeys.all });
        queryClient.invalidateQueries({ queryKey: libraryKeys.all });

        toast.success(i18n.t('addedTracks', { ns: 'toast', count: result.addedCount }));

        // Subfolder playlist detection — only show dialog if any subfolders lack playlists
        if (result.subfolders.length > 0) {
          const names = new Set((playlists as Playlist[]).map(p => p.name));
          const newSubfolders = result.subfolders.filter(sf => !names.has(sf.name));
          if (newSubfolders.length > 0) {
            setExistingPlaylistNames(names);
            setDetectedSubfolders(newSubfolders);
          }
        }
      } finally {
        resetScanProgress();
        releaseScanLock();
      }
    } catch (err) {
      logger.error('Failed to add folder:', err);
      toast.error(i18n.t('failedAddFolder', { ns: 'toast' }));
      resetScanProgress();
      releaseScanLock();
    }
  }, [folders, playlists, queryClient, setScanState, resetScanProgress]);

  const removeFolder = useCallback(
    async (id: string) => {
      if (!IS_ELECTRON) return;
      await withToast({
        mutate: () => removeFolderMutation.mutateAsync(id),
        successMessage: 'folderRemoved',
        errorMessage: 'failedRemoveFolder',
        logLabel: 'Failed to remove folder',
      });
    },
    [removeFolderMutation]
  );

  return {
    isScanning,
    addFolder,
    removeFolder,
    detectedSubfolders,
    existingPlaylistNames,
    clearDetectedSubfolders,
  };
}
