import { useCallback } from 'react';
import { useViewStore } from '@/stores/useViewStore';
import { useTranslation } from 'react-i18next';
import { withToast } from '@/hooks/useToastMutation';
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
export function usePlaylistMutations({ playlistId, playlist }: UsePlaylistMutationsOptions) {
  const { t: tToast } = useTranslation('toast');
  const selectPlaylist = useViewStore(s => s.selectPlaylist);

  const updateMutation = useUpdatePlaylistMutation();
  const deleteMutation = useDeletePlaylistMutation();
  const removeTrackMutation = useRemoveTrackFromPlaylistMutation();

  const handleSaveName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !playlistId || !playlist) return false;
      if (trimmed === playlist.name) return false;
      const result = await withToast({
        mutate: async () => {
          await updateMutation.mutateAsync({ id: playlistId, data: { name: trimmed } });
          return true;
        },
        successMessage: 'playlistRenamed',
        errorMessage: 'failedRename',
        logLabel: 'Failed to rename playlist',
      });
      return result ?? false;
    },
    [playlistId, playlist, updateMutation]
  );

  const handleDelete = useCallback(async () => {
    if (!playlistId) return;
    const result = await withToast({
      mutate: async () => {
        await deleteMutation.mutateAsync(playlistId);
        return true;
      },
      successMessage: 'playlistDeleted',
      errorMessage: 'failedDeletePlaylist',
      logLabel: 'Failed to delete playlist',
    });
    if (result) selectPlaylist(null);
  }, [playlistId, deleteMutation, selectPlaylist]);

  const handleRemoveTrack = useCallback(
    async (trackId: string) => {
      if (!playlistId) return;
      await withToast({
        mutate: () => removeTrackMutation.mutateAsync({ playlistId, trackIds: [trackId] }),
        successMessage: () => tToast('removedFromPlaylist', { name: playlist?.name ?? '' }),
        errorMessage: 'failedRemoveTrack',
        logLabel: 'Failed to remove track from playlist',
      });
    },
    [playlistId, removeTrackMutation, playlist, tToast]
  );

  const handleBulkRemoveFromPlaylist = useCallback(
    async (trackIds: string[]) => {
      if (!playlistId) return;
      await withToast({
        mutate: () => removeTrackMutation.mutateAsync({ playlistId, trackIds }),
        successMessage: () => tToast('removedTracksFromPlaylist', { count: trackIds.length }),
        errorMessage: 'failedRemoveTrack',
        logLabel: 'Failed to remove tracks from playlist',
      });
    },
    [playlistId, removeTrackMutation, tToast]
  );

  return { handleSaveName, handleDelete, handleRemoveTrack, handleBulkRemoveFromPlaylist };
}
