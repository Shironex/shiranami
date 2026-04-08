import { useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  useUpdatePlaylistMutation,
  useDeletePlaylistMutation,
  useRemoveTrackFromPlaylistMutation,
} from '@/hooks/queries/usePlaylists';
import type { Playlist } from '@/types/electron';

interface UsePlaylistMutationsOptions {
  playlistId: string | null;
  playlist: Playlist | null;
}

/**
 * Handles playlist mutation operations using TanStack Query mutations.
 */
export function usePlaylistMutations({
  playlistId,
  playlist,
}: UsePlaylistMutationsOptions) {
  const { t: tToast } = useTranslation('toast');
  const selectPlaylist = useAppStore((s) => s.selectPlaylist);

  const updateMutation = useUpdatePlaylistMutation();
  const deleteMutation = useDeletePlaylistMutation();
  const removeTrackMutation = useRemoveTrackFromPlaylistMutation();

  const handleSaveName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !playlistId || !playlist) return false;
      if (trimmed === playlist.name) return false;
      try {
        await updateMutation.mutateAsync({ id: playlistId, data: { name: trimmed } });
        toast.success(tToast('playlistRenamed'));
        return true;
      } catch {
        toast.error(tToast('failedRename'));
        return false;
      }
    },
    [playlistId, playlist, updateMutation, tToast]
  );

  const handleDelete = useCallback(async () => {
    if (!playlistId) return;
    try {
      await deleteMutation.mutateAsync(playlistId);
      toast.success(tToast('playlistDeleted'));
      selectPlaylist(null);
    } catch {
      toast.error(tToast('failedDeletePlaylist'));
    }
  }, [playlistId, deleteMutation, selectPlaylist, tToast]);

  const handleRemoveTrack = useCallback(
    async (trackId: string) => {
      if (!playlistId) return;
      try {
        await removeTrackMutation.mutateAsync({ playlistId, trackIds: [trackId] });
        toast.success(tToast('removedFromPlaylist', { name: playlist?.name ?? '' }));
      } catch {
        toast.error(tToast('failedRemoveTrack'));
      }
    },
    [playlistId, removeTrackMutation, tToast]
  );

  const handleBulkRemoveFromPlaylist = useCallback(
    async (trackIds: string[]) => {
      if (!playlistId) return;
      try {
        await removeTrackMutation.mutateAsync({ playlistId, trackIds });
        toast.success(tToast('removedTracksFromPlaylist', { count: trackIds.length }));
      } catch {
        toast.error(tToast('failedRemoveTrack'));
      }
    },
    [playlistId, removeTrackMutation, tToast]
  );

  return { handleSaveName, handleDelete, handleRemoveTrack, handleBulkRemoveFromPlaylist };
}
