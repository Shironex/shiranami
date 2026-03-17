import { useCallback, useState } from 'react';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { IS_ELECTRON } from '@/lib/platform';

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function useLibraryActions() {
  const setQueue = usePlayerStore(s => s.setQueue);
  const [isScanning, setIsScanning] = useState(false);

  const handleOpenFile = useCallback(async () => {
    if (!IS_ELECTRON) return;
    const filePath = await window.electronAPI.dialog.openFile();
    if (!filePath) return;
    const { metadata } = await window.electronAPI.library.parseMetadata(filePath);
    const track: Track = {
      id: generateId(),
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      duration: metadata.duration,
      filePath,
      albumArt: metadata.albumArt ?? undefined,
    };
    const currentQueue = usePlayerStore.getState().queue;
    const currentPlaying = usePlayerStore.getState().currentTrack;
    const newQueue = [...currentQueue, track];
    if (!currentPlaying) {
      setQueue(newQueue, newQueue.length - 1);
    } else {
      usePlayerStore.setState({ queue: newQueue });
    }
  }, [setQueue]);

  const handleOpenFolder = useCallback(async () => {
    if (!IS_ELECTRON) return;
    const dirPath = await window.electronAPI.dialog.openDirectory();
    if (!dirPath) return;
    setIsScanning(true);
    try {
      const results = await window.electronAPI.library.scanFolder(dirPath);
      const newTracks: Track[] = results.map(r => ({
        id: generateId(),
        title: r.metadata.title,
        artist: r.metadata.artist,
        album: r.metadata.album,
        duration: r.metadata.duration,
        filePath: r.filePath,
        albumArt: r.metadata.albumArt ?? undefined,
      }));
      if (newTracks.length === 0) return;
      const currentQueue = usePlayerStore.getState().queue;
      const currentPlaying = usePlayerStore.getState().currentTrack;
      const combined = [...currentQueue, ...newTracks];
      if (!currentPlaying) {
        setQueue(combined, 0);
      } else {
        usePlayerStore.setState({ queue: combined });
      }
    } finally {
      setIsScanning(false);
    }
  }, [setQueue]);

  return { handleOpenFile, handleOpenFolder, isScanning };
}
