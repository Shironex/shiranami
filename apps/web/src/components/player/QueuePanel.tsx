import { useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { X, Trash2, Music, Play, Pause } from 'lucide-react';
import { motion } from 'motion/react';

export function QueuePanel() {
  const queue = usePlayerStore(s => s.queue);
  const queueIndex = usePlayerStore(s => s.queueIndex);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const setQueue = usePlayerStore(s => s.setQueue);
  const removeFromQueue = usePlayerStore(s => s.removeFromQueue);
  const clearQueue = usePlayerStore(s => s.clearQueue);
  const togglePlay = usePlayerStore(s => s.togglePlay);

  const handlePlayIndex = useCallback(
    (index: number) => {
      if (index === queueIndex) {
        togglePlay();
      } else {
        setQueue(queue, index);
      }
    },
    [queue, queueIndex, setQueue, togglePlay]
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      removeFromQueue(index);
    },
    [removeFromQueue]
  );

  const upNext = queue.slice(queueIndex + 1);
  const upNextStartIndex = queueIndex + 1;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border/20 shrink-0 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
          Queue
        </h2>
        {queue.length > 0 && (
          <button
            onClick={clearQueue}
            className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/40 hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      {queue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Music className="w-7 h-7 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground/30 font-medium">Queue is empty</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2">
          {/* Now Playing */}
          {currentTrack && queueIndex >= 0 && (
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium px-2 mb-1.5">
                Now Playing
              </p>
              <QueueItem
                track={currentTrack}
                index={queueIndex}
                isActive={true}
                isPlaying={isPlaying}
                onPlay={handlePlayIndex}
                onRemove={handleRemove}
              />
            </div>
          )}

          {/* Up Next */}
          {upNext.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium px-2 mb-1.5">
                Up Next ({upNext.length})
              </p>
              <div className="space-y-0.5">
                {upNext.map((track, i) => (
                  <QueueItem
                    key={`${track.id}-${upNextStartIndex + i}`}
                    track={track}
                    index={upNextStartIndex + i}
                    isActive={false}
                    isPlaying={false}
                    onPlay={handlePlayIndex}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface QueueItemProps {
  track: { id: string; title: string; artist: string; albumArt?: string; duration: number };
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: (index: number) => void;
  onRemove: (e: React.MouseEvent, index: number) => void;
}

function QueueItem({ track, index, isActive, isPlaying, onPlay, onRemove }: QueueItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-200 group cursor-pointer',
        isActive
          ? 'bg-primary/[0.08]'
          : 'hover:bg-accent'
      )}
      onClick={() => onPlay(index)}
    >
      <div className={cn(
        'w-8 h-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden',
        isActive ? 'bg-primary/15' : 'bg-surface'
      )}>
        {track.albumArt ? (
          <img src={track.albumArt} alt="" className="w-full h-full object-cover rounded-md" />
        ) : isActive && isPlaying ? (
          <div className="flex items-end gap-[2px] h-3">
            <div className="w-[2px] h-full rounded-full bg-primary origin-bottom" style={{ animation: 'eq-bar-1 1.2s ease-in-out infinite' }} />
            <div className="w-[2px] h-full rounded-full bg-primary origin-bottom" style={{ animation: 'eq-bar-2 1.4s ease-in-out 0.2s infinite' }} />
            <div className="w-[2px] h-full rounded-full bg-primary origin-bottom" style={{ animation: 'eq-bar-3 1.1s ease-in-out 0.4s infinite' }} />
          </div>
        ) : isActive ? (
          <Pause className="w-3 h-3 text-primary" />
        ) : (
          <Play className="w-3 h-3 text-muted-foreground/40" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-medium truncate', isActive && 'text-primary')}>
          {track.title}
        </p>
        <p className="text-[10px] text-muted-foreground/50 truncate">{track.artist}</p>
      </div>

      <span className="text-[10px] text-muted-foreground/30 tabular-nums shrink-0">
        {track.duration > 0 ? formatDuration(track.duration) : ''}
      </span>

      <motion.button
        whileTap={{ scale: 0.75 }}
        onClick={(e) => onRemove(e, index)}
        className="shrink-0 p-0.5 rounded text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all duration-150"
        aria-label="Remove from queue"
      >
        <X className="w-3 h-3" />
      </motion.button>
    </div>
  );
}
