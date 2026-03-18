import { useState, useCallback } from 'react';
import { type Track } from '@/stores/usePlayerStore';
import { Heart, Play, X } from 'lucide-react';
import { formatDuration } from '@shiranami/shared';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { type RowComponentProps } from 'react-window';
import { AddToPlaylistButton } from '@/components/shared/AddToPlaylistButton';
import { TrackContextMenu, type ContextMenuPosition } from '@/components/shared/TrackContextMenu';

export interface TrackRowProps {
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  handlePlayTrack: (index: number) => void;
  onToggleFavorite?: (trackId: string) => void;
  onRemoveFromPlaylist?: (trackId: string) => void;
  showAddToPlaylist?: boolean;
}

export function TrackRow(props: RowComponentProps<TrackRowProps>) {
  const {
    index,
    style,
    queue,
    currentTrack,
    isPlaying,
    handlePlayTrack,
    onToggleFavorite,
    onRemoveFromPlaylist,
    showAddToPlaylist,
  } = props as RowComponentProps<TrackRowProps> & TrackRowProps;
  const track = queue[index];
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  if (!track) return null;
  const isActive = currentTrack?.id === track.id;

  return (
    <div style={style} className="px-0.5">
      <div
        onContextMenu={handleContextMenu}
        className={cn(
          'w-full flex items-center gap-3 px-3 h-[48px] rounded-xl text-left transition-all duration-200 group',
          isActive
            ? 'bg-primary/[0.08] text-foreground'
            : 'hover:bg-accent text-foreground/80 hover:text-foreground'
        )}
      >
        <button
          onClick={() => handlePlayTrack(index)}
          className="flex items-center gap-3 min-w-0 flex-1"
        >
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden',
            isActive ? 'bg-primary/15' : 'bg-surface'
          )}>
            {track.albumArt ? (
              <img src={track.albumArt} alt="" className="w-full h-full object-cover rounded-lg" />
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
            aria-label={track.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
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
            aria-label="Remove from playlist"
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
