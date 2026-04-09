import { useCallback, useState } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { IS_ELECTRON } from '@/lib/platform';
import { useTrackImport } from '@/hooks/useTrackImport';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import { mapDbTracksToTracks } from '@/lib/trackMapper';
import { queryClient } from '@/lib/queryClient';
import { libraryKeys } from '@/hooks/queries/useLibrary';
import { folderKeys } from '@/hooks/queries/useFolders';

export function useLibraryActions() {
  const setQueue = usePlayerStore(s => s.setQueue);
  const [isScanning, setIsScanning] = useState(false);
  const { importTrack } = useTrackImport();

  const handleOpenFile = useCallback(async () => {
    if (!IS_ELECTRON) return;
    try {
      const filePath = await window.electronAPI.dialog.openFile();
      if (!filePath) return;

      const track = await importTrack(filePath);
      if (!track) {
        toast.info(i18n.t('trackAlreadyInLibrary', { ns: 'toast' }));
        return;
      }

      toast.success(i18n.t('added1Track', { ns: 'toast' }));
    } catch (err) {
      console.error('Failed to add file:', err);
      toast.error(i18n.t('failedAddTrack', { ns: 'toast' }));
    }
  }, [importTrack]);

  const handleOpenFolder = useCallback(async () => {
    if (!IS_ELECTRON) return;
    const dirPath = await window.electronAPI.dialog.openDirectory();
    if (!dirPath) return;
    setIsScanning(true);
    try {
      const results = await window.electronAPI.library.scanFolder(dirPath);
      if (results.length === 0) {
        toast.info(i18n.t('noAudioInFolder', { ns: 'toast' }));
        return;
      }

      // Filter out tracks that already exist in the library
      const existingLibrary = usePlayerStore.getState().library;
      const existingPaths = new Set(existingLibrary.map(t => t.filePath));

      const newResults = results.filter(r => !existingPaths.has(r.filePath));

      // Also check DB for any tracks not in current queue
      const toCheck = await Promise.all(
        newResults.map(async r => ({
          result: r,
          exists: await window.electronAPI.db.tracks.exists(r.filePath),
        }))
      );
      const genuinelyNew = toCheck.filter(c => !c.exists).map(c => c.result);

      if (genuinelyNew.length === 0) {
        toast.info(i18n.t('allTracksExist', { ns: 'toast' }));
        return;
      }

      // Save to DB
      const dbTracks = (await window.electronAPI.db.tracks.addMany(
        genuinelyNew.map(r => ({
          filePath: r.filePath,
          title: r.metadata.title,
          artist: r.metadata.artist,
          album: r.metadata.album,
          duration: r.metadata.duration,
          genre: r.metadata.genre ?? null,
          year: r.metadata.year ?? null,
          trackNumber: r.metadata.trackNumber ?? null,
          discNumber: r.metadata.discNumber ?? null,
          albumArt: r.metadata.albumArt ?? null,
        }))
      )) as Record<string, unknown>[];

      const newTracks = mapDbTracksToTracks(dbTracks);

      // Save folder path to DB
      try {
        await window.electronAPI.db.folders.add(dirPath);
      } catch {
        // Folder may already exist, that's fine
      }

      // Add to library
      usePlayerStore.getState().addToLibrary(newTracks);

      // Also add to queue so they're immediately playable
      const currentQueue = usePlayerStore.getState().queue;
      const currentPlaying = usePlayerStore.getState().currentTrack;
      const combined = [...currentQueue, ...newTracks];
      if (!currentPlaying) {
        setQueue(combined, 0);
      } else {
        usePlayerStore.setState({ queue: combined });
      }

      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
      toast.success(i18n.t('addedTracks', { ns: 'toast', count: newTracks.length }));
    } catch (err) {
      console.error('Failed to add folder:', err);
      toast.error(i18n.t('failedScanFolder', { ns: 'toast' }));
    } finally {
      setIsScanning(false);
    }
  }, [setQueue]);

  return { handleOpenFile, handleOpenFolder, isScanning };
}
