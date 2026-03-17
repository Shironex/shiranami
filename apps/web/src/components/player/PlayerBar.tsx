import { usePlayerStore } from '@/stores/usePlayerStore';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { PlayerControls } from './PlayerControls';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeControl';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function PlayerBar() {
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const ambientColor = useAmbientColor();

  return (
    <AnimatePresence>
      {currentTrack && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50',
            'h-20 px-4',
            'flex items-center gap-4',
            'glass border-t border-border/50',
          )}
        >
          {/* Ambient glow */}
          <div
            className="absolute inset-0 opacity-[0.07] pointer-events-none transition-colors duration-1000"
            style={{
              background: `radial-gradient(ellipse at 20% 50%, rgba(${ambientColor.rgb}, 0.8) 0%, transparent 70%)`,
            }}
          />

          {/* Track info - left */}
          <div className="flex items-center gap-3 w-[280px] min-w-0 relative">
            <motion.div
              key={currentTrack.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden shadow-lg"
            >
              {currentTrack.albumArt ? (
                <img
                  src={currentTrack.albumArt}
                  alt={currentTrack.album}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music className="w-5 h-5 text-muted-foreground" />
              )}
            </motion.div>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTrack.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="min-w-0"
              >
                <p className="text-sm font-medium text-foreground truncate">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {currentTrack.artist}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Center - controls + seek */}
          <div className="flex-1 flex flex-col items-center gap-1 max-w-[600px] mx-auto relative">
            <PlayerControls />
            <div className="w-full flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">
                {formatDuration(currentTime)}
              </span>
              <SeekBar />
              <span className="text-[11px] text-muted-foreground tabular-nums w-10">
                {formatDuration(duration)}
              </span>
            </div>
          </div>

          {/* Right - volume */}
          <div className="w-[180px] flex justify-end relative">
            <VolumeControl />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
