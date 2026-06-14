import { Loader2, AlertCircle } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { PlaylistDetailHeader } from '../PlaylistDetailHeader';
import { PlaylistTrackList } from '../PlaylistTrackList';
import { usePlaylistDetailView } from './PlaylistDetailView.hooks';

export default function PlaylistDetailView() {
  const {
    t,
    tCommon,
    isLoading,
    isError,
    notFound,
    playlist,
    selectedPlaylistId,
    displayTracks,
    sortableIds,
    activeTrack,
    currentTrack,
    isPlaying,
    trackCount,
    hasTracks,
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
    onRetry,
    onBack,
    onPlayAll,
    onPlayTrack,
    onToggleFavorite,
    onRemoveTrack,
    onDelete,
    onBulkRemoveFromPlaylist,
    onStartEdit,
    onSaveName,
    onNameKeyDown,
    onDragStart,
    onDragEnd,
    onDragCancel,
  } = usePlaylistDetailView();

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
          onClick: onRetry,
        }}
      />
    );
  }

  if (notFound || !playlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
        <button onClick={onBack} className="text-xs text-primary hover:underline">
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
        trackCount={trackCount}
        totalDuration={totalDuration}
        hasTracks={hasTracks}
        suggestedCoverArt={suggestedCoverArt}
        cover={cover}
        isEditing={isEditing}
        editName={editName}
        setEditName={setEditName}
        nameInputRef={nameInputRef}
        showDeleteConfirm={showDeleteConfirm}
        setShowDeleteConfirm={setShowDeleteConfirm}
        onBack={onBack}
        onPlayAll={onPlayAll}
        onDelete={onDelete}
        onStartEdit={onStartEdit}
        onSaveName={onSaveName}
        onNameKeyDown={onNameKeyDown}
      />

      <PlaylistTrackList
        displayTracks={displayTracks}
        sortableIds={sortableIds}
        activeTrack={activeTrack}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        onPlayTrack={onPlayTrack}
        onToggleFavorite={onToggleFavorite}
        onRemoveTrack={onRemoveTrack}
      />

      {hasSelection && (
        <BulkActionBar trackList={displayTracks} onRemoveFromPlaylist={onBulkRemoveFromPlaylist} />
      )}
    </div>
  );
}
