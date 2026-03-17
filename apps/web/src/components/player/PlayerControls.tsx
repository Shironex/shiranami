import { usePlayerStore } from '@/stores/usePlayerStore';
import { cn } from '@/lib/utils';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function PlayerControls() {
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const isLoading = usePlayerStore(s => s.isLoading);
  const isShuffled = usePlayerStore(s => s.isShuffled);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const next = usePlayerStore(s => s.next);
  const previous = usePlayerStore(s => s.previous);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const cycleRepeatMode = usePlayerStore(s => s.cycleRepeatMode);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleShuffle}
        className={cn(
          'w-8 h-8 flex items-center justify-center rounded-md transition-colors',
          isShuffled
            ? 'text-primary hover:text-primary/80'
            : 'text-muted-foreground hover:text-foreground'
        )}
        aria-label="Shuffle"
      >
        <Shuffle className="w-4 h-4" />
      </button>

      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={previous}
        className="w-8 h-8 flex items-center justify-center rounded-md text-foreground hover:text-foreground/80 transition-colors"
        aria-label="Previous"
      >
        <SkipBack className="w-4 h-4 fill-current" />
      </motion.button>

      <motion.button
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.05 }}
        onClick={togglePlay}
        disabled={isLoading}
        className={cn(
          'w-9 h-9 flex items-center justify-center rounded-full',
          'bg-foreground text-background',
          'hover:bg-foreground/90 transition-colors',
          'disabled:opacity-50'
        )}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isLoading ? (
            <motion.div key="loading" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Loader2 className="w-4 h-4 animate-spin" />
            </motion.div>
          ) : isPlaying ? (
            <motion.div key="pause" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Pause className="w-4 h-4 fill-current" />
            </motion.div>
          ) : (
            <motion.div key="play" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={next}
        className="w-8 h-8 flex items-center justify-center rounded-md text-foreground hover:text-foreground/80 transition-colors"
        aria-label="Next"
      >
        <SkipForward className="w-4 h-4 fill-current" />
      </motion.button>

      <button
        onClick={cycleRepeatMode}
        className={cn(
          'w-8 h-8 flex items-center justify-center rounded-md transition-colors',
          repeatMode !== 'off'
            ? 'text-primary hover:text-primary/80'
            : 'text-muted-foreground hover:text-foreground'
        )}
        aria-label={`Repeat: ${repeatMode}`}
      >
        {repeatMode === 'one' ? (
          <Repeat1 className="w-4 h-4" />
        ) : (
          <Repeat className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
