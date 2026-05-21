import { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewStore } from '@/stores/useViewStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { usePlaylistMutations } from '@/hooks/usePlaylistMutations';
import { usePlaylistCover } from '@/hooks/usePlaylistCover';
import { usePlaylistDetailQuery, useReorderPlaylistMutation } from '@/hooks/queries/usePlaylists';
import { useClickOutside } from '@/hooks/useClickOutside';
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Loader2, AlertCircle } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { PlaylistDetailHeader } from './PlaylistDetailHeader';
import { PlaylistTrackList } from './PlaylistTrackList';

export function PlaylistDetailView() {
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

  const sortableIds = useMemo(() => displayTracks.map(t => t.id), [displayTracks]);

  const [activeId, setActiveId] = useState<string | null>(null);

  const activeTrack = useMemo(
    () => (activeId ? (displayTracks.find(t => t.id === activeId) ?? null) : null),
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
  const totalDuration = useMemo(() => tracks.reduce((sum, t) => sum + t.duration, 0), [tracks]);

  // Cover art
  const suggestedCoverArt = tracks.find(track => track.albumArt)?.albumArt;
  const cover = usePlaylistCover({ playlistId: selectedPlaylistId, suggestedCoverArt });
  const { showCoverMenu, setShowCoverMenu, coverMenuRef } = cover;

  useClickOutside(coverMenuRef, () => setShowCoverMenu(false), showCoverMenu);

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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <ViewEmptyState
        variant="error"
        title={t('errorTitle')}
        subtitle={t('errorSubtitle')}
        icon={AlertCircle}
        action={{
          label: tCommon('retry'),
          onClick: () => {
            void refetch();
          },
        }}
      />
    );
  }

  if (!playlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
        <button onClick={handleBack} className="text-xs text-primary hover:underline">
          {t('goBack')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PlaylistDetailHeader
        playlist={playlist}
        selectedPlaylistId={selectedPlaylistId}
        trackCount={tracks.length}
        totalDuration={totalDuration}
        hasTracks={tracks.length > 0}
        suggestedCoverArt={suggestedCoverArt}
        cover={cover}
        isEditing={isEditing}
        editName={editName}
        setEditName={setEditName}
        nameInputRef={nameInputRef}
        showDeleteConfirm={showDeleteConfirm}
        setShowDeleteConfirm={setShowDeleteConfirm}
        onBack={handleBack}
        onPlayAll={handlePlayAll}
        onDelete={handleDelete}
        onStartEdit={handleStartEdit}
        onSaveName={handleSaveNameSubmit}
        onNameKeyDown={handleNameKeyDown}
      />

      <PlaylistTrackList
        displayTracks={displayTracks}
        sortableIds={sortableIds}
        activeTrack={activeTrack}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        onPlayTrack={handlePlayTrack}
        onToggleFavorite={toggleFavorite}
        onRemoveTrack={handleRemoveTrack}
      />

      {hasSelection && (
        <BulkActionBar
          trackList={displayTracks}
          onRemoveFromPlaylist={handleBulkRemoveFromPlaylist}
        />
      )}
    </div>
  );
}

export default PlaylistDetailView;
