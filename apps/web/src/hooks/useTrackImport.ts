import { useCallback } from 'react';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { IS_ELECTRON } from '@/lib/platform';

/**
 * Shared hook for importing a downloaded audio file into the library.
 * Parses metadata, checks for duplicates, inserts into DB, and adds to the player store.
 * Returns the created Track, or null if the track already exists.
 */
export function useTrackImport() {
  const addToLibrary = usePlayerStore((s) => s.addToLibrary);
  const setQueue = usePlayerStore((s) => s.setQueue);

  const importTrack = useCallback(
    async (filePath: string): Promise<Track | null> => {
      if (!IS_ELECTRON) return null;

      const { metadata } = await window.electronAPI.library.parseMetadata(filePath);

      const exists = await window.electronAPI.db.tracks.exists(filePath);
      if (exists) return null;

      const dbTrack = (await window.electronAPI.db.tracks.add({
        filePath,
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        duration: metadata.duration,
        genre: metadata.genre ?? null,
        year: metadata.year ?? null,
        trackNumber: metadata.trackNumber ?? null,
        albumArt: metadata.albumArt ?? null,
      })) as Record<string, unknown>;

      const track: Track = {
        id: dbTrack.id as string,
        title: dbTrack.title as string,
        artist: (dbTrack.artist as string) ?? 'Unknown Artist',
        album: (dbTrack.album as string) ?? 'Unknown Album',
        duration: (dbTrack.duration as number) ?? 0,
        filePath: dbTrack.filePath as string,
        albumArt: (dbTrack.albumArt as string | null) ?? undefined,
        genre: dbTrack.genre as string | null | undefined,
        year: dbTrack.year as number | null | undefined,
        trackNumber: dbTrack.trackNumber as number | null | undefined,
        isFavorite: (dbTrack.isFavorite as boolean) ?? false,
        playCount: (dbTrack.playCount as number) ?? 0,
        createdAt: dbTrack.createdAt as string | undefined,
        updatedAt: dbTrack.updatedAt as string | undefined,
      };

      addToLibrary([track]);

      const currentQueue = usePlayerStore.getState().queue;
      const currentPlaying = usePlayerStore.getState().currentTrack;
      const newQueue = [...currentQueue, track];
      if (!currentPlaying) {
        setQueue(newQueue, newQueue.length - 1);
      } else {
        usePlayerStore.setState({ queue: newQueue });
      }

      return track;
    },
    [addToLibrary, setQueue]
  );

  return { importTrack };
}
