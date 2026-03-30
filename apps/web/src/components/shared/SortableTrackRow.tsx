import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type Track } from '@/stores/usePlayerStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { Heart, Play, X, Check, GripVertical } from 'lucide-react';
import { formatDuration } from '@shiranami/shared';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { AddToPlaylistButton } from '@/components/shared/AddToPlaylistButton';
import { TrackContextMenu, type ContextMenuPosition } from '@/components/shared/TrackContextMenu';

export interface SortableTrackRowProps {
  track: Track;
  index: number;
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  handlePlayTrack: (index: number) => void;
  onToggleFavorite?: (trackId: string) => void;
  onRemoveFromPlaylist?: (trackId: string) => void;
  showAddToPlaylist?: boolean;
}

export function SortableTrackRow({
  track,
  index,
  queue,
  currentTrack,
  isPlaying,
  handlePlayTrack,
  onToggleFavorite,
  onRemoveFromPlaylist,
  showAddToPlaylist,
}: SortableTrackRowProps) {
  const { t } = useTranslation('contextMenu');
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);

  const isSelected = useSelectionStore((s) => s.selectedTrackIds.has(track.id));
  const hasSelection = useSelectionStore((s) => s.selectedTrackIds.size > 0);
  const selectedTrackIds = useSelectionStore((s) => s.selectedTrackIds);
  const toggleTrack = useSelectionStore((s) => s.toggleTrack);
  const selectRange = useSelectionStore((s) => s.selectRange);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.4 : undefined,
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasSelection && !selectedTrackIds.has(track.id)) {
      clearSelection();
    }
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [hasSelection, track.id, selectedTrackIds, clearSelection]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const isMod = e.metaKey || e.ctrlKey;
    const isShift = e.shiftKey;

    if (isMod) {
      e.preventDefault();
      toggleTrack(track.id, index);
      return;
    }
    if (isShift) {
      e.preventDefault();
      selectRange(index, queue);
      return;
    }
    if (hasSelection) {
      clearSelection();
    }
    handlePlayTrack(index);
  }, [track.id, index, queue, hasSelection, toggleTrack, selectRange, clearSelection, handlePlayTrack]);

  const isActive = currentTrack?.id === track.id;

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="px-0.5">
      <div
        onContextMenu={handleContextMenu}
        className={cn(
          'w-full flex items-center gap-1.5 px-1.5 h-[48px] rounded-xl text-left transition-colors duration-200 group',
          isSelected
            ? 'bg-primary/[0.12] text-foreground ring-1 ring-primary/20'
            : isActive
              ? 'bg-primary/[0.08] text-foreground'
              : 'hover:bg-accent text-foreground/80 hover:text-foreground'
        )}
      >
        {/* Drag handle */}
        <button
          {...listeners}
          className="shrink-0 p-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors touch-none opacity-0 group-hover:opacity-100"
          aria-label={t('dragToReorder')}
          tabIndex={-1}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleClick}
          className="flex items-center gap-3 min-w-0 flex-1"
        >
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative',
            isSelected ? 'bg-primary/20' : isActive ? 'bg-primary/15' : 'bg-surface'
          )}>
            {isSelected ? (
              <Check className="w-4 h-4 text-primary" />
            ) : track.albumArt ? (
              <img src={track.albumArt} alt={track.title} className="w-full h-full object-cover rounded-lg" />
            ) : isActive && isPlaying ? (
              <div className="flex items-end gap-[3px] h-4">
                <div className="w-[3px] h-full rounded-full bg-primary origin-bottom" style={{ animation: 'eq-bar-1 1.2s ease-in-out infinite' }} />
                <div className="w-[3px] h-full rounded-full bg-primary origin-bottom" style={{ animation: 'eq-bar-2 1.4s ease-in-out 0.2s infinite' }} />
                <div className="w-[3px] h-full rounded-full bg-primary origin-bottom" style={{ animation: 'eq-bar-3 1.1s ease-in-out 0.4s infinite' }} />
              </div>
            ) : (
              <Play className="w-3.5 h-3.5 text-muted-foreground/40" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-medium truncate text-left', isActive && 'text-primary')}>{track.title}</p>
            <p className="text-xs text-muted-foreground/60 truncate text-left">{track.artist}</p>
          </div>
        </button>

        <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0 font-medium">
          {track.duration > 0 ? formatDuration(track.duration) : ''}
        </span>

        {showAddToPlaylist && (
          <AddToPlaylistButton trackId={track.id} />
        )}

        {onToggleFavorite && (
          <motion.button
            whileTap={{ scale: 0.75 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(track.id);
            }}
            className={cn(
              'shrink-0 p-1 rounded-md transition-colors duration-150',
              track.isFavorite
                ? 'text-red-400 hover:text-red-300'
                : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-muted-foreground/60'
            )}
            aria-label={track.isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
          >
            <Heart
              className={cn('w-3.5 h-3.5 transition-all duration-150', track.isFavorite && 'fill-current')}
            />
          </motion.button>
        )}

        {onRemoveFromPlaylist && (
          <motion.button
            whileTap={{ scale: 0.75 }}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFromPlaylist(track.id);
            }}
            className="shrink-0 p-1 rounded-md text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-destructive transition-colors duration-150"
            aria-label={t('removeFromPlaylist')}
          >
            <X className="w-3.5 h-3.5" />
          </motion.button>
        )}
      </div>
      {contextMenu && (
        <TrackContextMenu
          track={track}
          position={contextMenu}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
}
