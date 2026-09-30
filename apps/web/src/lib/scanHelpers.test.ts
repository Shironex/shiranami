import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';
import { removeMissingTracks, scanAndPersistFolder } from '@/lib/scanHelpers';

const scanned = (filePath: string) => ({
  filePath,
  metadata: {
    title: filePath,
    artist: 'Artist',
    albumArtist: null,
    album: 'Album',
    duration: 200,
    genre: 'Lofi',
    year: 2024,
    trackNumber: 1,
    discNumber: 1,
    albumArt: null,
  },
});

const track = (id: string, filePath: string): Track => ({
  id,
  title: id,
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  filePath,
  isFavorite: false,
});

describe('scanHelpers', () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: [] });
    usePlaybackStore.setState({ queue: [], queueIndex: -1, currentTrack: null });
    vi.mocked(window.electronAPI.library.scanFolderGrouped).mockResolvedValue({
      rootTracks: [scanned('/music/a.mp3')],
      subfolders: [],
    } as never);
    vi.mocked(window.electronAPI.db.tracks.existsMany)
      .mockReset()
      .mockResolvedValue([] as never);
    vi.mocked(window.electronAPI.db.tracks.addMany)
      .mockReset()
      .mockResolvedValue([] as never);
    // By default the backend deletes every row it is asked to.
    vi.mocked(window.electronAPI.db.tracks.removeMany)
      .mockReset()
      .mockImplementation((async (ids: string[]) => ids) as never);
  });

  describe('scanAndPersistFolder', () => {
    it('never asks the backend to follow moves unless told to (add folder, add files)', async () => {
      await scanAndPersistFolder('/music');

      const calls = vi.mocked(window.electronAPI.db.tracks.addMany).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0]).toHaveLength(1);
    });

    it('asks the backend to follow moves when the rescan opts in', async () => {
      await scanAndPersistFolder('/music', { followMoves: true });

      expect(window.electronAPI.db.tracks.addMany).toHaveBeenCalledWith(expect.any(Array), {
        followMoves: true,
      });
    });

    it('reports a folder whose files all conflicted as not all-existing, as before', async () => {
      const result = await scanAndPersistFolder('/music');

      expect(result.allExisted).toBe(false);
      expect(result.addedCount).toBe(0);
    });
  });

  describe('removeMissingTracks', () => {
    it('deletes only at the paths it checked, and returns what it removed', async () => {
      useLibraryStore.setState({
        library: [track('gone', '/music/gone.mp3'), track('kept', '/music/kept.mp3')],
      });
      vi.mocked(window.electronAPI.library.validateFiles).mockResolvedValue([
        '/music/gone.mp3',
      ] as never);

      const removed = await removeMissingTracks(useLibraryStore.getState().library);

      expect(window.electronAPI.db.tracks.removeMany).toHaveBeenCalledWith(
        ['gone'],
        ['/music/gone.mp3']
      );
      expect(removed).toEqual(['gone']);
      expect(useLibraryStore.getState().library.map(t => t.id)).toEqual(['kept']);
    });
  });
});
