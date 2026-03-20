import { useCallback, useState } from 'react';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { IS_ELECTRON } from '@/lib/platform';
import { useTrackImport } from '@/hooks/useTrackImport';
import { toast } from 'sonner';

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
        toast.info('Track already in library');
        return;
      }

      toast.success('Added 1 track to library');
    } catch (err) {
      console.error('Failed to add file:', err);
      toast.error('Failed to add track');
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
        toast.info('No audio files found in folder');
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
        toast.info('All tracks already in library');
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
          albumArt: r.metadata.albumArt ?? null,
        }))
      )) as Record<string, unknown>[];

      const newTracks: Track[] = dbTracks.map(t => ({
        id: t.id as string,
        title: t.title as string,
        artist: (t.artist as string) ?? 'Unknown Artist',
        album: (t.album as string) ?? 'Unknown Album',
        duration: (t.duration as number) ?? 0,
        filePath: t.filePath as string,
        albumArt: (t.albumArt as string | null) ?? undefined,
        genre: t.genre as string | null | undefined,
        year: t.year as number | null | undefined,
        trackNumber: t.trackNumber as number | null | undefined,
        isFavorite: (t.isFavorite as boolean) ?? false,
        playCount: (t.playCount as number) ?? 0,
        createdAt: t.createdAt as string | undefined,
        updatedAt: t.updatedAt as string | undefined,
      }));

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

      toast.success(`Added ${newTracks.length} track${newTracks.length === 1 ? '' : 's'} to library`);
    } catch (err) {
      console.error('Failed to add folder:', err);
      toast.error('Failed to scan folder');
    } finally {
      setIsScanning(false);
    }
  }, [setQueue]);

  return { handleOpenFile, handleOpenFolder, isScanning };
}
