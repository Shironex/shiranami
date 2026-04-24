import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { acquireScanLock, releaseScanLock } from '@/lib/scanLock';
import { scanAndPersistFolder, type SubfolderGroup } from '@/lib/scanHelpers';
import { folderKeys } from '@/hooks/queries/useFolders';
import { libraryKeys } from '@/hooks/queries/useLibrary';
import { playlistKeys, usePlaylistsQuery } from '@/hooks/queries/usePlaylists';
import { removeTracksFromQueue } from '@/hooks/useRemoveFromLibrary';
import type { Playlist } from '@/types/electron';
import type { WatchedFolder } from '@/components/settings/MusicFoldersSection';

export interface UseLibraryRescanResult {
  isScanning: boolean;
  isClearing: boolean;
  confirmClear: boolean;
  setConfirmClear: (v: boolean) => void;
  rescan: () => Promise<void>;
  clearLibrary: () => Promise<void>;
  detectedSubfolders: SubfolderGroup[];
  existingPlaylistNames: Set<string>;
  clearDetectedSubfolders: () => void;
}

export function useLibraryRescan(): UseLibraryRescanResult {
  const queryClient = useQueryClient();
  const { data: playlists = [] } = usePlaylistsQuery();
  const clearQueue = usePlaybackStore((s) => s.clearQueue);
  const removeFromLibrary = useLibraryStore((s) => s.removeFromLibrary);

  const [isScanning, setIsScanning] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [detectedSubfolders, setDetectedSubfolders] = useState<SubfolderGroup[]>([]);
  const [existingPlaylistNames, setExistingPlaylistNames] = useState<Set<string>>(new Set());

  const clearDetectedSubfolders = useCallback(() => {
    setDetectedSubfolders([]);
  }, []);

  const rescan = useCallback(async () => {
    if (!IS_ELECTRON || !acquireScanLock()) return;

    let folders: WatchedFolder[];
    try {
      folders = await queryClient.fetchQuery({
        queryKey: folderKeys.all,
        queryFn: async () =>
          (await window.electronAPI.db.folders.getAll()) as WatchedFolder[],
      });
    } catch {
      toast.error(i18n.t('failedLoadFolders', { ns: 'toast' }));
      releaseScanLock();
      return;
    }

    if (folders.length === 0) {
      releaseScanLock();
      return;
    }

    setIsScanning(true);
    let totalAdded = 0;
    const allDetectedSubfolders: SubfolderGroup[] = [];

    try {
      for (const folder of folders) {
        try {
          const result = await scanAndPersistFolder(folder.path);

          if (result.subfolders.length > 0) {
            allDetectedSubfolders.push(...result.subfolders);
          }

          totalAdded += result.addedCount;

          // Update last scanned timestamp (matches original behavior).
          await window.electronAPI.db.folders.updateScanned(folder.id);
        } catch {
          // Skip folders that fail to scan (e.g., deleted directories)
        }
      }

      // Validate existing tracks — remove any whose files no longer exist on disk
      let totalRemoved = 0;
      const currentLibrary = useLibraryStore.getState().library;
      if (currentLibrary.length > 0) {
        const allPaths = currentLibrary.map((t) => t.filePath);
        const missingPaths = await window.electronAPI.library.validateFiles(allPaths);
        if (missingPaths.length > 0) {
          const missingSet = new Set(missingPaths);
          const staleIds = currentLibrary
            .filter((t) => missingSet.has(t.filePath))
            .map((t) => t.id);
          if (staleIds.length > 0) {
            await window.electronAPI.db.tracks.removeMany(staleIds);
            removeFromLibrary(staleIds);
            removeTracksFromQueue(staleIds);
            totalRemoved = staleIds.length;
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: folderKeys.all });

      if (totalAdded > 0 && totalRemoved > 0) {
        toast.success(
          i18n.t('rescanSummary', { ns: 'toast', added: totalAdded, removed: totalRemoved }),
        );
      } else if (totalAdded > 0) {
        toast.success(i18n.t('foundNewTracks', { ns: 'toast', count: totalAdded }));
      } else if (totalRemoved > 0) {
        toast.success(i18n.t('removedStaleTracks', { ns: 'toast', count: totalRemoved }));
      } else {
        toast.info(i18n.t('libraryUpToDate', { ns: 'toast' }));
      }

      // Subfolder playlist detection — only show dialog if any subfolders lack playlists
      if (allDetectedSubfolders.length > 0) {
        const names = new Set((playlists as Playlist[]).map((p) => p.name));
        const newSubfolders = allDetectedSubfolders.filter((sf) => !names.has(sf.name));
        if (newSubfolders.length > 0) {
          setExistingPlaylistNames(names);
          setDetectedSubfolders(newSubfolders);
        }
      }
    } catch (err) {
      console.error('Rescan failed:', err);
      toast.error(i18n.t('failedRescan', { ns: 'toast' }));
    } finally {
      setIsScanning(false);
      releaseScanLock();
    }
  }, [queryClient, playlists, removeFromLibrary]);

  const clearLibrary = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setIsClearing(true);
    try {
      const allTracks = useLibraryStore.getState().library;
      if (allTracks.length > 0) {
        await window.electronAPI.db.tracks.removeMany(allTracks.map((t) => t.id));
      }
      clearQueue();
      useLibraryStore.setState({ library: [] });
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: playlistKeys.all });
      setConfirmClear(false);
      toast.success(i18n.t('libraryCleared', { ns: 'toast' }));
    } catch (err) {
      console.error('Failed to clear library:', err);
      toast.error(i18n.t('failedClearLibrary', { ns: 'toast' }));
    } finally {
      setIsClearing(false);
    }
  }, [clearQueue, queryClient]);

  return {
    isScanning,
    isClearing,
    confirmClear,
    setConfirmClear,
    rescan,
    clearLibrary,
    detectedSubfolders,
    existingPlaylistNames,
    clearDetectedSubfolders,
  };
}
