import { useCallback, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { acquireScanLock, releaseScanLock } from '@/lib/scanLock';
import { scanAndPersistFolder, type SubfolderGroup } from '@/lib/scanHelpers';
import {
  confirmMissing,
  selectFolders,
  tracksInFolders,
  watcherDeletions,
} from '@/lib/folderScope';
import { folderKeys } from '@/hooks/queries/useFolders';
import { libraryKeys } from '@/hooks/queries/useLibrary';
import { diskUsageKeys } from '@/hooks/queries/useDiskUsage';
import { playlistKeys, usePlaylistsQuery } from '@/hooks/queries/usePlaylists';
import type { Playlist } from '@/types/electron';
import type { WatchedFolder } from '@/components/settings/MusicFoldersSection';

export interface RescanOptions {
  /** Rescan only these folders (by id), and validate only their tracks. */
  folderIds?: readonly string[];
  /** Watcher-triggered: no "up to date" toast and no subfolder dialog. */
  quiet?: boolean;
}

export interface UseLibraryRescanResult {
  isScanning: boolean;
  isClearing: boolean;
  confirmClear: boolean;
  setConfirmClear: (v: boolean) => void;
  rescan: (options?: RescanOptions) => Promise<void>;
  clearLibrary: () => Promise<void>;
  detectedSubfolders: SubfolderGroup[];
  existingPlaylistNames: Set<string>;
  clearDetectedSubfolders: () => void;
}

export function useLibraryRescan(): UseLibraryRescanResult {
  const queryClient = useQueryClient();
  const { data: playlists = [] } = usePlaylistsQuery();
  const clearQueue = usePlaybackStore(s => s.clearQueue);
  const removeFromLibrary = useLibraryStore(s => s.removeFromLibrary);
  const scanState = useLibraryStore(s => s.scanState);
  const setScanState = useLibraryStore(s => s.setScanState);
  const resetScanProgress = useLibraryStore(s => s.resetScanProgress);
  const isScanning = scanState !== 'idle';

  const [isClearing, setIsClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [detectedSubfolders, setDetectedSubfolders] = useState<SubfolderGroup[]>([]);
  const [existingPlaylistNames, setExistingPlaylistNames] = useState<Set<string>>(new Set());

  const clearDetectedSubfolders = useCallback(() => {
    setDetectedSubfolders([]);
  }, []);

  // Handed from `rescan` to `runRescan` and taken before the lock check, so a
  // refused run cannot leave its scope behind for the next one.
  const nextOptions = useRef<RescanOptions | undefined>(undefined);

  const runRescan = useCallback(async () => {
    const { folderIds, quiet } = readRescanOptions(nextOptions.current);
    nextOptions.current = undefined;
    if (!IS_ELECTRON || !acquireScanLock()) return;

    let folders: WatchedFolder[];
    try {
      folders = await queryClient.fetchQuery({
        queryKey: folderKeys.all,
        queryFn: async () => (await window.electronAPI.db.folders.getAll()) as WatchedFolder[],
      });
    } catch {
      toast.error(i18n.t('failedLoadFolders', { ns: 'toast' }));
      releaseScanLock();
      return;
    }

    folders = selectFolders(folders, folderIds);
    if (folders.length === 0) {
      releaseScanLock();
      return;
    }

    setScanState('scanning');
    let totalAdded = 0;
    const allDetectedSubfolders: SubfolderGroup[] = [];
    const unscannedIds = new Set<string>();

    try {
      for (const folder of folders) {
        try {
          const result = await scanAndPersistFolder(folder.path);
          if (result.empty) unscannedIds.add(folder.id);

          if (result.subfolders.length > 0) {
            allDetectedSubfolders.push(...result.subfolders);
          }

          totalAdded += result.addedCount;

          // Update last scanned timestamp (matches original behavior).
          await window.electronAPI.db.folders.updateScanned(folder.id);
        } catch {
          // Skip folders that fail to scan (e.g., deleted directories)
          unscannedIds.add(folder.id);
        }
      }

      // Validate existing tracks — remove any whose files are missing from disk
      let totalRemoved = 0;
      const currentLibrary = tracksInFolders(
        useLibraryStore.getState().library,
        folderIds ? folders : undefined
      );
      if (currentLibrary.length > 0) {
        const allPaths = currentLibrary.map(t => t.filePath);
        const validated = await window.electronAPI.library.validateFiles(allPaths);
        // Only paths missing on a second look are deleted, and watcher runs
        // never delete what looks like a vanished volume.
        const missingPaths = quiet
          ? await watcherDeletions({
              folders,
              tracks: currentLibrary,
              missing: validated,
              unscannedIds,
            })
          : await confirmMissing(validated);
        if (missingPaths.length > 0) {
          const missingSet = new Set(missingPaths);
          const staleIds = currentLibrary.filter(t => missingSet.has(t.filePath)).map(t => t.id);
          if (staleIds.length > 0) {
            await window.electronAPI.db.tracks.removeMany(staleIds);
            removeFromLibrary(staleIds);
            totalRemoved = staleIds.length;
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
      // Files were added/removed on disk — recompute disk usage.
      queryClient.invalidateQueries({ queryKey: diskUsageKeys.all });

      if (totalAdded > 0 && totalRemoved > 0) {
        toast.success(
          i18n.t('rescanSummary', { ns: 'toast', added: totalAdded, removed: totalRemoved })
        );
      } else if (totalAdded > 0) {
        toast.success(i18n.t('foundNewTracks', { ns: 'toast', count: totalAdded }));
      } else if (totalRemoved > 0) {
        toast.success(i18n.t('removedStaleTracks', { ns: 'toast', count: totalRemoved }));
      } else if (!quiet) {
        toast.info(i18n.t('libraryUpToDate', { ns: 'toast' }));
      }

      // Subfolder playlist detection — only show dialog if any subfolders lack playlists
      if (!quiet && allDetectedSubfolders.length > 0) {
        const names = new Set((playlists as Playlist[]).map(p => p.name));
        const newSubfolders = allDetectedSubfolders.filter(sf => !names.has(sf.name));
        if (newSubfolders.length > 0) {
          setExistingPlaylistNames(names);
          setDetectedSubfolders(newSubfolders);
        }
      }
    } catch (err) {
      logger.error('Rescan failed:', err);
      toast.error(i18n.t('failedRescan', { ns: 'toast' }));
    } finally {
      resetScanProgress();
      releaseScanLock();
    }
  }, [queryClient, playlists, removeFromLibrary, setScanState, resetScanProgress]);

  const rescan = useCallback(
    (options?: RescanOptions) => {
      nextOptions.current = options;
      return runRescan();
    },
    [runRescan]
  );

  const clearLibrary = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setIsClearing(true);
    try {
      const allTracks = useLibraryStore.getState().library;
      if (allTracks.length > 0) {
        await window.electronAPI.db.tracks.removeMany(allTracks.map(t => t.id));
      }
      clearQueue();
      // Go through the action (not setState) so the mutation overlay is
      // cleared alongside the canonical array.
      useLibraryStore.getState().setLibrary([]);
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: playlistKeys.all });
      setConfirmClear(false);
      toast.success(i18n.t('libraryCleared', { ns: 'toast' }));
    } catch (err) {
      logger.error('Failed to clear library:', err);
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

/**
 * The scope of one rescan, read defensively: the settings button passes its
 * click event as the first argument, which must read as "everything".
 */
function readRescanOptions(options: RescanOptions | undefined): {
  folderIds: readonly string[] | undefined;
  quiet: boolean;
} {
  return {
    folderIds: Array.isArray(options?.folderIds) ? options.folderIds : undefined,
    quiet: options?.quiet === true,
  };
}
