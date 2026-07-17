import { memo } from 'react';
import { Heart, Play, X, Check } from 'lucide-react';
import { formatDuration } from '@shiranami/shared';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { SCALE_CARD } from '@/lib/motion';
import { AddToPlaylistButton } from '@/components/shared/AddToPlaylistButton';
import { EqBars } from '@/components/shared/EqBars';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { TrackContextMenu } from '@/components/shared/TrackContextMenu';
import { useTrackRowContent } from './TrackRowContent.hooks';
import type { ITrackRowContentProps } from './TrackRowContent.types';

function TrackRowContentImpl(props: ITrackRowContentProps) {
  const {
    track,
    isPlaying,
    onToggleFavorite,
    onRemoveFromPlaylist,
    showAddToPlaylist,
    compact,
    dragHandle,
  } = props;
  const {
    t,
    contextMenu,
    isSelected,
    isActive,
    isFavorite,
    handleContextMenu,
    handleCloseContextMenu,
    handleClick,
  } = useTrackRowContent(props);

  const durationLabel = track.duration > 0 ? formatDuration(track.duration) : '';

  const thumbnailFallback = isSelected ? (
    <Check className="w-4 h-4 text-primary" />
  ) : isActive && isPlaying ? (
    <>
      <span className="sr-only">{t('nowPlaying', { ns: 'common' })}</span>
      <EqBars />
    </>
  ) : (
    <Play className="w-3.5 h-3.5 text-muted-foreground/40" />
  );

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

        <motion.button
          whileTap={SCALE_CARD}
          onClick={handleClick}
          className="flex items-center gap-3 min-w-0 flex-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <TrackThumbnail
            albumArt={isSelected ? null : track.albumArt}
            alt={track.title}
            imgClassName="rounded-lg"
            className={cn(
              'w-9 h-9 rounded-lg relative',
              isSelected ? 'bg-primary/20' : isActive ? 'bg-primary/15' : 'bg-surface'
            )}
            fallback={thumbnailFallback}
          />
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-medium truncate text-left', isActive && 'text-primary')}>
              {track.title}
            </p>
            <p className="text-xs text-muted-foreground/60 truncate text-left">{track.artist}</p>
          </div>
        </motion.button>

        <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0 font-medium">
          {durationLabel}
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
 * row-scoped Zustand selectors in the hook, so a default shallow prop
 * comparison is enough — only the now-playing flags legitimately change per row.
 */
const TrackRowContent = memo(TrackRowContentImpl);

export default TrackRowContent;
