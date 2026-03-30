import { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { useAppStore } from '@/stores/useAppStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { usePlaylistDetail } from '@/hooks/usePlaylistDetail';
import { usePlaylistMutations } from '@/hooks/usePlaylistMutations';
import { usePlaylistCover } from '@/hooks/usePlaylistCover';
import { useReorderPlaylistMutation } from '@/hooks/queries/usePlaylists';
import { useClickOutside } from '@/hooks/useClickOutside';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  ArrowLeft,
  Play,
  Share2,
  Trash2,
  ListMusic,
  Loader2,
  ImagePlus,
  Sparkles,
  XCircle,
  GripVertical,
} from 'lucide-react';
import { formatDuration } from '@shiranami/shared';
import { motion, AnimatePresence } from 'motion/react';
import { SortableTrackRow } from '@/components/shared/SortableTrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';

/** Overlay shown while dragging — matches SortableTrackRow layout */
function DragOverlayContent({ track }: { track: import('@/stores/usePlayerStore').Track }) {
  return (
    <div className="px-0.5">
      <div className="w-full flex items-center gap-1.5 px-1.5 h-[48px] rounded-xl bg-accent text-foreground">
        <div className="shrink-0 p-0.5 text-muted-foreground/40">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-surface">
            {track.albumArt ? (
              <img src={track.albumArt} alt="" className="w-full h-full object-cover rounded-lg" />
            ) : (
              <Play className="w-3.5 h-3.5 text-muted-foreground/40" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{track.title}</p>
            <p className="text-xs text-muted-foreground/60 truncate">{track.artist}</p>
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0 font-medium">
          {track.duration > 0 ? formatDuration(track.duration) : ''}
        </span>
      </div>
    </div>
  );
}

export function PlaylistDetailView() {
  const { t } = useTranslation('playlists');
  const selectedPlaylistId = useAppStore((s) => s.selectedPlaylistId);
  const selectPlaylist = useAppStore((s) => s.selectPlaylist);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const toggleFavorite = usePlayerStore((s) => s.toggleFavorite);
  const hasSelection = useSelectionStore((s) => s.selectedTrackIds.size > 0);

  // Data fetching
  const { playlist, tracks, displayTracks, isLoading } =
    usePlaylistDetail(selectedPlaylistId);

  // Mutations
  const { handleSaveName, handleDelete, handleRemoveTrack, handleBulkRemoveFromPlaylist } =
    usePlaylistMutations({ playlistId: selectedPlaylistId, playlist });
  const reorderMutation = useReorderPlaylistMutation();

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortableIds = useMemo(
    () => displayTracks.map((t) => t.id),
    [displayTracks]
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const activeTrack = useMemo(
    () => (activeId ? displayTracks.find((t) => t.id === activeId) ?? null : null),
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

  // Cover art
  const suggestedCoverArt = tracks.find((track) => track.albumArt)?.albumArt;
  const {
    showCoverMenu,
    setShowCoverMenu,
    isUpdatingCover,
    coverMenuRef,
    coverInputRef,
    handleCoverFileSelected,
    handlePickCustomCover,
    handleUseSuggestedCover,
    handleClearCover,
  } = usePlaylistCover({ playlistId: selectedPlaylistId, suggestedCoverArt });

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
      {/* Header */}
      <div className="px-6 pt-2 pb-4 shrink-0 space-y-3">
        {/* Back + actions row */}
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleBack}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={t('back')}
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>

          <div className="flex-1" />

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handlePlayAll}
            disabled={tracks.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {t('playAll')}
          </motion.button>

          {IS_ELECTRON && selectedPlaylistId && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('open-share-dialog', {
                    detail: { type: 'playlist', id: selectedPlaylistId },
                  })
                );
              }}
              className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
              aria-label={t('share', { ns: 'share' })}
            >
              <Share2 className="w-3.5 h-3.5" />
            </motion.button>
          )}

          <div className="relative">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label={t('deletePlaylist')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </motion.button>

            <AnimatePresence>
              {showDeleteConfirm && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-52 p-3 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50"
                >
                  <p className="text-xs text-foreground/80 mb-2">{t('deleteConfirm')}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDelete}
                      className="flex-1 px-2 py-1 rounded-lg text-xs font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
                    >
                      {t('delete', { ns: 'common' })}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      {t('cancel', { ns: 'common' })}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Playlist info */}
        <div className="flex items-center gap-4">
          <div ref={coverMenuRef} className="relative shrink-0">
            <button
              onClick={() => setShowCoverMenu((open) => !open)}
              className="group/cover relative w-16 h-16 rounded-xl bg-surface border border-border/30 flex items-center justify-center overflow-hidden"
              disabled={isUpdatingCover}
              title={t('editCover')}
            >
              {playlist.coverArt ? (
                <img src={playlist.coverArt} alt="" className="w-full h-full object-cover" />
              ) : (
                <ListMusic className="w-7 h-7 text-muted-foreground/20" />
              )}

              <div className="absolute inset-0 bg-black/0 group-hover/cover:bg-black/30 transition-colors flex items-center justify-center">
                {isUpdatingCover ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4 text-white opacity-0 group-hover/cover:opacity-100 transition-opacity" />
                )}
              </div>
            </button>

            <input
              ref={coverInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleCoverFileSelected}
            />

            <AnimatePresence>
              {showCoverMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 w-52 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50"
                >
                  <button
                    onClick={handlePickCustomCover}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <ImagePlus className="w-4 h-4 text-muted-foreground/60" />
                    {t('uploadCustomImage')}
                  </button>

                  {suggestedCoverArt && (
                    <button
                      onClick={handleUseSuggestedCover}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <Sparkles className="w-4 h-4 text-muted-foreground/60" />
                      {t('useTrackArtwork')}
                    </button>
                  )}

                  {playlist.coverArt && (
                    <button
                      onClick={handleClearCover}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      {t('removeCover')}
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                ref={nameInputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveNameSubmit}
                onKeyDown={handleNameKeyDown}
                className="font-display text-lg font-semibold text-foreground bg-transparent outline-none border-b border-primary/40 w-full pb-0.5"
              />
            ) : (
              <button
                onClick={handleStartEdit}
                className="font-display text-lg font-semibold text-foreground truncate block text-left hover:text-primary transition-colors"
                title={t('clickToRename')}
              >
                {playlist.name}
              </button>
            )}
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {t('trackCount', { count: tracks.length })}
            </p>
          </div>
        </div>
      </div>

      {/* Track list */}
      {tracks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <ListMusic className="w-16 h-16 text-muted-foreground/20" strokeWidth={1.5} />
          <div>
            <p className="font-display text-base font-medium text-muted-foreground">
              {t('detailEmptyTitle')}
            </p>
            <p className="text-sm text-muted-foreground/50 mt-1">{t('detailEmptySubtitle')}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 scrollbar-thin">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {displayTracks.map((track, index) => (
                <SortableTrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  queue={displayTracks}
                  currentTrack={currentTrack}
                  isPlaying={isPlaying}
                  handlePlayTrack={handlePlayTrack}
                  onToggleFavorite={toggleFavorite}
                  onRemoveFromPlaylist={handleRemoveTrack}
                />
              ))}
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeTrack ? <DragOverlayContent track={activeTrack} /> : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

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
