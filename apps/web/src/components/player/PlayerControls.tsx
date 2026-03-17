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
    <div className="flex items-center gap-2">
      <button
        onClick={toggleShuffle}
        className={cn(
          'w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200',
          isShuffled
            ? 'text-primary'
            : 'text-muted-foreground/60 hover:text-muted-foreground'
        )}
        aria-label="Shuffle"
      >
        <Shuffle className="w-3.5 h-3.5" />
      </button>

      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={previous}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground/80 hover:text-foreground transition-colors"
        aria-label="Previous"
      >
        <SkipBack className="w-4 h-4 fill-current" />
      </motion.button>

      <motion.button
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.04 }}
        onClick={togglePlay}
        disabled={isLoading}
        className={cn(
          'w-10 h-10 flex items-center justify-center rounded-full',
          'bg-primary text-primary-foreground',
          'shadow-md shadow-primary/20',
          'hover:shadow-lg hover:shadow-primary/30',
          'transition-shadow duration-200',
          'disabled:opacity-50'
        )}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isLoading ? (
            <motion.div key="loading" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}>
              <Loader2 className="w-4.5 h-4.5 animate-spin" />
            </motion.div>
          ) : isPlaying ? (
            <motion.div key="pause" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}>
              <Pause className="w-4.5 h-4.5 fill-current" />
            </motion.div>
          ) : (
            <motion.div key="play" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}>
              <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={next}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground/80 hover:text-foreground transition-colors"
        aria-label="Next"
      >
        <SkipForward className="w-4 h-4 fill-current" />
      </motion.button>

      <button
        onClick={cycleRepeatMode}
        className={cn(
          'w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200',
          repeatMode !== 'off'
            ? 'text-primary'
            : 'text-muted-foreground/60 hover:text-muted-foreground'
        )}
        aria-label={`Repeat: ${repeatMode}`}
      >
        {repeatMode === 'one' ? (
          <Repeat1 className="w-3.5 h-3.5" />
        ) : (
          <Repeat className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
