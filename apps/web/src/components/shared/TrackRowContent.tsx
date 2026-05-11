import { type ReactNode, memo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { type Track } from '@/stores/types';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';
import { Heart, Play, X, Check } from 'lucide-react';
import { formatDuration } from '@shiranami/shared';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { AddToPlaylistButton } from '@/components/shared/AddToPlaylistButton';
import { EqBars } from '@/components/shared/EqBars';
import { TrackContextMenu, type ContextMenuPosition } from '@/components/shared/TrackContextMenu';

export interface TrackRowContentProps {
  track: Track;
  index: number;
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  handlePlayTrack: (index: number) => void;
  onToggleFavorite?: (trackId: string) => void;
  onRemoveFromPlaylist?: (trackId: string) => void;
  showAddToPlaylist?: boolean;
  compact?: boolean;
  dragHandle?: ReactNode;
}

function TrackRowContentImpl({
  track,
  index,
  queue,
  currentTrack,
  isPlaying,
  handlePlayTrack,
  onToggleFavorite,
  onRemoveFromPlaylist,
  showAddToPlaylist,
  compact,
  dragHandle,
}: TrackRowContentProps) {
  const { t } = useTranslation('contextMenu');
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);

  const isSelected = useSelectionStore(s => s.selectedTrackIds.has(track.id));
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);
  const toggleTrack = useSelectionStore(s => s.toggleTrack);
  const selectRange = useSelectionStore(s => s.selectRange);
  const clearSelection = useSelectionStore(s => s.clearSelection);

  // Heart icon subscribes to *this row's* overlay favorite value only — a
  // toggle anywhere in the app (player bar, context menu, this row) updates
  // the overlay store, and Zustand's Object.is comparison re-renders just the
  // toggled row instead of every mounted virtual row. Falls back to the seed
  // value on the passed-in `track` when no overlay entry exists.
  const overlayFavorite = useTrackOverlayStore(s => s.overlays.get(track.id)?.isFavorite);
  const isFavorite = overlayFavorite ?? track.isFavorite;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Read the live Set via getState() instead of subscribing to it — the
      // row only cares whether *it* is in the current selection at click time.
      if (hasSelection && !useSelectionStore.getState().selectedTrackIds.has(track.id)) {
        clearSelection();
      }
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [hasSelection, track.id, clearSelection]
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
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
    },
    [
      track.id,
      index,
      queue,
      hasSelection,
      toggleTrack,
      selectRange,
      clearSelection,
      handlePlayTrack,
    ]
  );

  const isActive = currentTrack?.id === track.id;

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        className={cn(
          'w-full flex items-center h-[48px] rounded-xl text-left duration-200 group',
          compact ? 'gap-1.5 px-1.5 transition-colors' : 'gap-3 px-3 transition-all',
          isSelected
            ? 'bg-primary/[0.12] text-foreground ring-1 ring-primary/20'
            : isActive
              ? 'bg-primary/[0.08] text-foreground'
              : 'hover:bg-accent text-foreground/80 hover:text-foreground'
        )}
      >
        {dragHandle}

        <button onClick={handleClick} className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative',
              isSelected ? 'bg-primary/20' : isActive ? 'bg-primary/15' : 'bg-surface'
            )}
          >
            {isSelected ? (
              <Check className="w-4 h-4 text-primary" />
            ) : track.albumArt ? (
              <img
                src={track.albumArt}
                alt={track.title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover rounded-lg"
              />
            ) : isActive && isPlaying ? (
              <>
                <span className="sr-only">{t('nowPlaying', { ns: 'common' })}</span>
                <EqBars />
              </>
            ) : (
              <Play className="w-3.5 h-3.5 text-muted-foreground/40" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-medium truncate text-left', isActive && 'text-primary')}>
              {track.title}
            </p>
            <p className="text-xs text-muted-foreground/60 truncate text-left">{track.artist}</p>
          </div>
        </button>

        <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0 font-medium">
          {track.duration > 0 ? formatDuration(track.duration) : ''}
        </span>

        {showAddToPlaylist && <AddToPlaylistButton trackId={track.id} />}

        {onToggleFavorite && (
          <motion.button
            whileTap={{ scale: 0.75 }}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onToggleFavorite(track.id);
            }}
            className={cn(
              'shrink-0 p-1 rounded-md transition-colors duration-150',
              isFavorite
                ? 'text-favorite hover:text-favorite-hover'
                : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-muted-foreground/60'
            )}
            aria-label={isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
          >
            <Heart
              className={cn(
                'w-3.5 h-3.5 transition-all duration-150',
                isFavorite && 'fill-current'
              )}
            />
          </motion.button>
        )}

        {onRemoveFromPlaylist && (
          <motion.button
            whileTap={{ scale: 0.75 }}
            onClick={(e: React.MouseEvent) => {
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
        <TrackContextMenu track={track} position={contextMenu} onClose={handleCloseContextMenu} />
      )}
    </>
  );
}

/**
 * Memoised so a list re-render (e.g. `react-window` re-rendering all mounted
 * rows when its `rowProps` object identity changes, or the now-playing row's
 * `currentTrack`/`isPlaying` flipping) doesn't propagate into every row. The
 * row's volatile state (its selection flag, its overlay favorite) is read via
 * row-scoped Zustand selectors above, so a default shallow prop comparison is
 * enough — only the now-playing flags legitimately change per row.
 */
export const TrackRowContent = memo(TrackRowContentImpl);
