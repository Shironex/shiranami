import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';
import {
  usePlaylistsQuery,
  useCreatePlaylistMutation,
  useAddTrackToPlaylistMutation,
  useRemoveTrackFromPlaylistMutation,
  useTrackPlaylistMembershipQuery,
} from '@/hooks/queries/usePlaylists';
import type {
  IPlaylistPickerContentProps,
  IPlaylistPickerContentView,
} from './PlaylistPickerContent.types';

export function usePlaylistPickerContent({
  trackIds,
  onDone,
  toastMode,
}: IPlaylistPickerContentProps): IPlaylistPickerContentView {
  const { t: tToast } = useTranslation('toast');
  const { t: tCommon } = useTranslation('common');
  const { data: playlists = [], isLoading } = usePlaylistsQuery();
  const { data: memberPlaylistIds = [] } = useTrackPlaylistMembershipQuery(trackIds);
  const addTrackMutation = useAddTrackToPlaylistMutation();
  const removeTrackMutation = useRemoveTrackFromPlaylistMutation();
  const createPlaylistMutation = useCreatePlaylistMutation();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');

  const memberSet = useMemo(() => new Set(memberPlaylistIds), [memberPlaylistIds]);
  const isBulk = toastMode === 'bulk' || (toastMode == null && trackIds.length > 1);
  // Any in-flight membership change: rows go non-interactive so a second click
  // doesn't queue a conflicting add/remove before the first resolves.
  const isMutating =
    addTrackMutation.isPending || removeTrackMutation.isPending || createPlaylistMutation.isPending;

  const onToggle = useCallback(
    async (playlist: Playlist) => {
      const isInPlaylist = memberSet.has(playlist.id);

      if (isInPlaylist) {
        try {
          await removeTrackMutation.mutateAsync({ playlistId: playlist.id, trackIds });
          if (isBulk) {
            toast.success(
              tToast('removedTracksFromPlaylist', { count: trackIds.length, name: playlist.name })
            );
          } else {
            toast.success(tToast('removedFromPlaylist', { name: playlist.name }));
          }
          onDone();
        } catch {
          toast.error(tToast('failedRemoveFromPlaylist'));
        }
      } else {
        try {
          await addTrackMutation.mutateAsync({ playlistId: playlist.id, trackIds });
          if (isBulk) {
            toast.success(
              tToast('addedTracksToPlaylist', { count: trackIds.length, name: playlist.name })
            );
          } else {
            toast.success(tToast('addedToPlaylist', { name: playlist.name }));
          }
          onDone();
        } catch {
          toast.error(tToast('failedAddToPlaylist'));
        }
      }
    },
    [trackIds, isBulk, memberSet, addTrackMutation, removeTrackMutation, onDone, tToast]
  );

  const onCreateAndAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    // Create isn't idempotent — a double Enter/click would otherwise make two
    // playlists. Block re-entry while either mutation is in flight.
    if (createPlaylistMutation.isPending || addTrackMutation.isPending) return;

    let playlist: Playlist;
    try {
      playlist = await createPlaylistMutation.mutateAsync({ name });
    } catch {
      toast.error(tToast('failedCreatePlaylist'));
      return;
    }

    // The playlist now exists; if only the track-add fails, tell the truth so
    // the user doesn't think nothing was created and retry into a duplicate.
    try {
      await addTrackMutation.mutateAsync({ playlistId: playlist.id, trackIds });
      if (isBulk) {
        toast.success(
          tToast('createdPlaylistAddedTracks', { name: playlist.name, count: trackIds.length })
        );
      } else {
        toast.success(tToast('createdPlaylistAdded', { name: playlist.name }));
      }
      onDone();
    } catch {
      toast.error(tToast('createdPlaylistAddFailed', { name: playlist.name }));
      onDone();
    }
  }, [newName, trackIds, isBulk, createPlaylistMutation, addTrackMutation, onDone, tToast]);

  const onCancelNewForm = useCallback(() => {
    setShowNewForm(false);
    setNewName('');
  }, []);

  const isMember = useCallback((playlistId: string) => memberSet.has(playlistId), [memberSet]);

  const onShowNewForm = useCallback(() => setShowNewForm(true), []);

  return {
    tCommon,
    isLoading,
    playlists,
    isMember,
    isMutating,
    onToggle,
    showNewForm,
    onShowNewForm,
    onCancelNewForm,
    newName,
    onNewNameChange: setNewName,
    onCreateAndAdd,
  };
}
