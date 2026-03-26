import { useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useAppStore } from '@/stores/useAppStore';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';
import { notifyPlaylistsChanged } from '@/lib/playlists';
import type { Track } from '@/stores/usePlayerStore';

interface UsePlaylistMutationsOptions {
  playlistId: string | null;
  playlist: Playlist | null;
  setPlaylist: React.Dispatch<React.SetStateAction<Playlist | null>>;
  setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
}

/**
 * Handles playlist mutation operations: rename, delete, remove tracks (single + bulk).
 */
export function usePlaylistMutations({
  playlistId,
  playlist,
  setPlaylist,
  setTracks,
}: UsePlaylistMutationsOptions) {
  const { t: tToast } = useTranslation('toast');
  const selectPlaylist = useAppStore((s) => s.selectPlaylist);

  const handleSaveName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !IS_ELECTRON || !playlistId || !playlist) return false;
      if (trimmed === playlist.name) return false;
      try {
        await window.electronAPI.db.playlists.update(playlistId, { name: trimmed });
        setPlaylist((prev) => (prev ? { ...prev, name: trimmed } : prev));
        notifyPlaylistsChanged();
        toast.success(tToast('playlistRenamed'));
        return true;
      } catch {
        toast.error(tToast('failedRename'));
        return false;
      }
    },
    [playlistId, playlist, setPlaylist, tToast]
  );

  const handleDelete = useCallback(async () => {
    if (!IS_ELECTRON || !playlistId) return;
    try {
      await window.electronAPI.db.playlists.delete(playlistId);
      notifyPlaylistsChanged();
      toast.success(tToast('playlistDeleted'));
      selectPlaylist(null);
    } catch {
      toast.error(tToast('failedDeletePlaylist'));
    }
  }, [playlistId, selectPlaylist, tToast]);

  const handleRemoveTrack = useCallback(
    async (trackId: string) => {
      if (!IS_ELECTRON || !playlistId) return;
      try {
        await window.electronAPI.db.playlists.removeTrack(playlistId, trackId);
        setTracks((prev) => prev.filter((t) => t.id !== trackId));
        toast.success(tToast('removedFromPlaylist'));
      } catch {
        toast.error(tToast('failedRemoveTrack'));
      }
    },
    [playlistId, setTracks, tToast]
  );

  const handleBulkRemoveFromPlaylist = useCallback(
    async (trackIds: string[]) => {
      if (!IS_ELECTRON || !playlistId) return;
      try {
        for (const id of trackIds) {
          await window.electronAPI.db.playlists.removeTrack(playlistId, id);
        }
        const idsSet = new Set(trackIds);
        setTracks((prev) => prev.filter((t) => !idsSet.has(t.id)));
        toast.success(tToast('removedTracksFromPlaylist', { count: trackIds.length }));
      } catch {
        toast.error(tToast('failedRemoveTrack'));
      }
    },
    [playlistId, setTracks, tToast]
  );

  return { handleSaveName, handleDelete, handleRemoveTrack, handleBulkRemoveFromPlaylist };
}
