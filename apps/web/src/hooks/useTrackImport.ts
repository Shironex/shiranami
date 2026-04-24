import { useCallback } from 'react';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';
import { IS_ELECTRON } from '@/lib/platform';
import { mapDbTrackToTrack } from '@/lib/trackMapper';
import { queryClient } from '@/lib/queryClient';
import { libraryKeys } from '@/hooks/queries/useLibrary';

/**
 * Shared hook for importing a downloaded audio file into the library.
 * Parses metadata, checks for duplicates, inserts into DB, and adds to the player store.
 * Returns the created Track, or null if the track already exists.
 */
export function useTrackImport() {
  const addToLibrary = useLibraryStore(s => s.addToLibrary);
  const setQueue = usePlaybackStore(s => s.setQueue);

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
        discNumber: metadata.discNumber ?? null,
        albumArt: metadata.albumArt ?? null,
      })) as Record<string, unknown>;

      const track: Track = mapDbTrackToTrack(dbTrack);

      addToLibrary([track]);

      const currentQueue = usePlaybackStore.getState().queue;
      const currentPlaying = usePlaybackStore.getState().currentTrack;
      const newQueue = [...currentQueue, track];
      if (!currentPlaying) {
        setQueue(newQueue, newQueue.length - 1);
      } else {
        usePlaybackStore.setState({ queue: newQueue });
      }

      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      return track;
    },
    [addToLibrary, setQueue]
  );

  return { importTrack };
}
