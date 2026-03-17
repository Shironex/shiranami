import { useCallback } from 'react';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { Music, Play, Pause } from 'lucide-react';
import { formatDuration } from '@shiranami/shared';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { List, type RowComponentProps } from 'react-window';

interface TrackRowProps {
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  handlePlayTrack: (index: number) => void;
}

function TrackRow(props: RowComponentProps<TrackRowProps>) {
  const { index, style, queue, currentTrack, isPlaying, handlePlayTrack } = props as RowComponentProps<TrackRowProps> & TrackRowProps;
  const track = queue[index];
  if (!track) return null;
  const isActive = currentTrack?.id === track.id;

  return (
    <div style={style} className="px-0.5">
      <button
        onClick={() => handlePlayTrack(index)}
        className={cn(
          'w-full flex items-center gap-3 px-3 h-[48px] rounded-xl text-left transition-all duration-200',
          isActive
            ? 'bg-primary/[0.08] text-foreground'
            : 'hover:bg-accent text-foreground/80 hover:text-foreground'
        )}
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
          <p className={cn('text-sm font-medium truncate', isActive && 'text-primary')}>{track.title}</p>
          <p className="text-xs text-muted-foreground/60 truncate">{track.artist}</p>
        </div>
        <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0 font-medium">
          {track.duration > 0 ? formatDuration(track.duration) : ''}
        </span>
      </button>
    </div>
  );
}

export function LibraryView() {
  const queue = usePlayerStore(s => s.queue);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const setQueue = usePlayerStore(s => s.setQueue);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const ambientColor = useAmbientColor();

  const handlePlayTrack = useCallback(
    (index: number) => {
      setQueue(queue, index);
    },
    [queue, setQueue]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Now Playing Hero */}
      <AnimatePresence>
        {currentTrack && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="px-6 pb-4 shrink-0 overflow-hidden"
          >
            <div
              className="relative rounded-2xl overflow-hidden p-5 flex items-center gap-5"
              style={{
                background: `linear-gradient(135deg, rgba(${ambientColor.rgb}, 0.15) 0%, rgba(${ambientColor.rgb}, 0.05) 100%)`,
              }}
            >
              {/* Blurred album art background */}
              {currentTrack.albumArt && (
                <div
                  className="absolute inset-0 opacity-[0.08] blur-2xl scale-110"
                  style={{ backgroundImage: `url(${currentTrack.albumArt})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                />
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTrack.id}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 250 }}
                  className="w-24 h-24 rounded-xl overflow-hidden shadow-2xl shadow-black/30 shrink-0 bg-muted flex items-center justify-center"
                >
                  {currentTrack.albumArt ? (
                    <img src={currentTrack.albumArt} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music className="w-8 h-8 text-muted-foreground/40" />
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="relative min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-1">Now Playing</p>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentTrack.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2 className="font-display text-lg font-semibold text-foreground truncate">{currentTrack.title}</h2>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{currentTrack.artist} — {currentTrack.album}</p>
                  </motion.div>
                </AnimatePresence>
              </div>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-primary/20 hover:bg-primary/30 flex items-center justify-center text-primary transition-colors shrink-0"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Track list */}
      {queue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <img src="./mascot.png" alt="" className="w-28 h-28 object-contain opacity-40" draggable={false} />
          <div>
            <p className="font-display text-base font-medium text-muted-foreground">No tracks yet</p>
            <p className="text-sm text-muted-foreground/50 mt-1">Add files or a folder to start listening</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-4">
          <List
            rowCount={queue.length}
            rowHeight={52}
            overscanCount={10}
            className="scrollbar-thin"
            style={{ height: '100%' }}
            rowComponent={TrackRow}
            rowProps={{ queue, currentTrack, isPlaying, handlePlayTrack }}
          />
        </div>
      )}
    </div>
  );
}
