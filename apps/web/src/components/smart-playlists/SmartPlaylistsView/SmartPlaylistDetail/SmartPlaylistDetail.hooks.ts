import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useViewStore } from '@/stores/useViewStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import {
  useSmartPlaylistQuery,
  useSmartPlaylistTracksQuery,
  useDeleteSmartPlaylistMutation,
} from '@/hooks/queries/useSmartPlaylists';
import type {
  ISmartPlaylistDetailProps,
  ISmartPlaylistDetailView,
} from './SmartPlaylistDetail.types';

export function useSmartPlaylistDetail({
  id,
}: ISmartPlaylistDetailProps): ISmartPlaylistDetailView {
  const { t } = useTranslation('smartPlaylists');
  const { t: tCommon } = useTranslation('common');
  const { t: tToast } = useTranslation('toast');
  const selectSmartPlaylist = useViewStore(s => s.selectSmartPlaylist);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);

  const { data: playlist, isLoading: loadingMeta } = useSmartPlaylistQuery(id);
  const { data: tracks = [], isLoading: loadingTracks } = useSmartPlaylistTracksQuery(id);
  const deleteMutation = useDeleteSmartPlaylistMutation();
  const [editOpen, setEditOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteRef = useRef<HTMLDivElement>(null);
  useClickOutside(deleteRef, () => setShowDeleteConfirm(false), showDeleteConfirm);

  // Read the latest tracks through a ref so `handlePlayTrack` keeps a stable
  // identity across track-list refetches.
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const handlePlayTrack = useCallback(
    (index: number) => setQueue(tracksRef.current, index),
    [setQueue]
  );

  const handleBack = useCallback(() => selectSmartPlaylist(null), [selectSmartPlaylist]);

  const handleDelete = useCallback(async () => {
    if (deleteMutation.isPending) return;
    try {
      await deleteMutation.mutateAsync(id);
      setShowDeleteConfirm(false);
      selectSmartPlaylist(null);
    } catch {
      // Keep the confirm popover open so the user can retry or cancel.
      toast.error(tToast('failedDeleteSmartPlaylist'));
    }
  }, [deleteMutation, id, selectSmartPlaylist, tToast]);

  const rowProps = useMemo(
    () => ({
      queue: tracks,
      currentTrack,
      isPlaying,
      handlePlayTrack,
      onToggleFavorite: toggleFavorite,
      showAddToPlaylist: true,
    }),
    [tracks, currentTrack, isPlaying, handlePlayTrack, toggleFavorite]
  );

  return {
    t,
    tCommon,
    playlist,
    showMetaLoader: loadingMeta,
    showTracksLoader: loadingTracks,
    matchCountLabel: t('matchCount', { count: tracks.length }),
    hasNoTracks: tracks.length === 0,
    rowCount: tracks.length,
    rowProps,
    deleteRef,
    showDeleteConfirm,
    isDeleting: deleteMutation.isPending,
    editOpen,
    setEditOpen,
    onEdit: () => setEditOpen(true),
    onToggleDeleteConfirm: () => setShowDeleteConfirm(v => !v),
    onCancelDelete: () => setShowDeleteConfirm(false),
    onDelete: handleDelete,
    onBack: handleBack,
  };
}
