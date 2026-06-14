import { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useViewStore } from '@/stores/useViewStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { usePlaylistMutations } from '@/hooks/usePlaylistMutations';
import { usePlaylistCover } from '@/hooks/usePlaylistCover';
import { usePlaylistDetailQuery, useReorderPlaylistMutation } from '@/hooks/queries/usePlaylists';
import { useClickOutside } from '@/hooks/useClickOutside';
import type { IPlaylistDetailViewView } from './PlaylistDetailView.types';

export function usePlaylistDetailView(): IPlaylistDetailViewView {
  const { t } = useTranslation('playlists');
  const { t: tCommon } = useTranslation('common');
  const selectedPlaylistId = useViewStore(s => s.selectedPlaylistId);
  const selectPlaylist = useViewStore(s => s.selectPlaylist);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);

  // Data fetching
  const { playlist, tracks, displayTracks, isLoading, isError, refetch } =
    usePlaylistDetailQuery(selectedPlaylistId);

  // Mutations
  const { handleSaveName, handleDelete, handleRemoveTrack, handleBulkRemoveFromPlaylist } =
    usePlaylistMutations({ playlistId: selectedPlaylistId, playlist });
  const reorderMutation = useReorderPlaylistMutation();

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortableIds = useMemo(() => displayTracks.map(track => track.id), [displayTracks]);

  const [activeId, setActiveId] = useState<string | null>(null);

  const activeTrack = useMemo(
    () => (activeId ? (displayTracks.find(track => track.id === activeId) ?? null) : null),
    [activeId, displayTracks]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id || !selectedPlaylistId) return;

      const oldIndex = sortableIds.indexOf(active.id as string);
      const newIndex = sortableIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(sortableIds, oldIndex, newIndex);
      reorderMutation.mutate({ playlistId: selectedPlaylistId, trackIds: newOrder });
    },
    [sortableIds, selectedPlaylistId, reorderMutation]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // Computed stats
  const totalDuration = useMemo(
    () => tracks.reduce((sum, track) => sum + track.duration, 0),
    [tracks]
  );

  // Cover art
  const suggestedCoverArt = tracks.find(track => track.albumArt)?.albumArt;
  const cover = usePlaylistCover({ playlistId: selectedPlaylistId, suggestedCoverArt });
  const { showCoverMenu, setShowCoverMenu } = cover;

  useClickOutside(cover.coverMenuRef, () => setShowCoverMenu(false), showCoverMenu);

  // Inline editing
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleBack = useCallback(() => selectPlaylist(null), [selectPlaylist]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length === 0) return;
    setQueue(tracks, 0);
  }, [tracks, setQueue]);

  const handlePlayTrack = useCallback(
    (index: number) => {
      if (tracks.length === 0) return;
      setQueue(tracks, index);
    },
    [tracks, setQueue]
  );

  const handleStartEdit = useCallback(() => {
    if (!playlist) return;
    setEditName(playlist.name);
    setIsEditing(true);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }, [playlist]);

  const handleSaveNameSubmit = useCallback(async () => {
    await handleSaveName(editName);
    setIsEditing(false);
  }, [editName, handleSaveName]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSaveNameSubmit();
      if (e.key === 'Escape') setIsEditing(false);
    },
    [handleSaveNameSubmit]
  );

  return {
    t,
    tCommon,
    isLoading,
    isError,
    notFound: !isLoading && !isError && !playlist,
    playlist,
    selectedPlaylistId,
    displayTracks,
    sortableIds,
    activeTrack,
    currentTrack,
    isPlaying,
    trackCount: tracks.length,
    hasTracks: tracks.length > 0,
    totalDuration,
    suggestedCoverArt,
    cover,
    sensors,
    hasSelection,
    isEditing,
    editName,
    setEditName,
    nameInputRef,
    showDeleteConfirm,
    setShowDeleteConfirm,
    onRetry: () => {
      void refetch();
    },
    onBack: handleBack,
    onPlayAll: handlePlayAll,
    onPlayTrack: handlePlayTrack,
    onToggleFavorite: toggleFavorite,
    onRemoveTrack: handleRemoveTrack,
    onDelete: handleDelete,
    onBulkRemoveFromPlaylist: handleBulkRemoveFromPlaylist,
    onStartEdit: handleStartEdit,
    onSaveName: handleSaveNameSubmit,
    onNameKeyDown: handleNameKeyDown,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragCancel: handleDragCancel,
  };
}
