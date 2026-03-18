import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { PlayerControls } from './PlayerControls';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeControl';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { Music, Mic2, ListMusic, AudioLines } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export function PlayerBar() {
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const ambientColor = useAmbientColor();
  const rightPanel = useAppStore(s => s.rightPanel);
  const toggleRightPanel = useAppStore(s => s.toggleRightPanel);
  const showVisualizer = useAppStore(s => s.showVisualizer);
  const toggleVisualizer = useAppStore(s => s.toggleVisualizer);

  return (
    <AnimatePresence>
      {currentTrack && (
        <motion.div
          initial={{ y: 88, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 88, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className={cn(
            'absolute bottom-0 left-0 right-0 z-50',
            'h-[88px] px-5',
            'flex items-center gap-5',
            'glass border-t border-border/30',
          )}
        >
          {/* Ambient glow */}
          <div
            className="absolute inset-0 opacity-[0.06] pointer-events-none rounded-none transition-all duration-[2s]"
            style={{
              background: `radial-gradient(ellipse at 15% 50%, rgba(${ambientColor.rgb}, 0.9) 0%, transparent 60%)`,
            }}
          />

          {/* Track info - left */}
          <div className="flex items-center gap-3.5 w-[280px] min-w-0 relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTrack.id}
                initial={{ scale: 0.85, opacity: 0, rotate: -3 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.85, opacity: 0, rotate: 3 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden shadow-lg shadow-black/20"
              >
                {currentTrack.albumArt ? (
                  <img
                    src={currentTrack.albumArt}
                    alt={currentTrack.album}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="w-6 h-6 text-muted-foreground/50" />
                )}
              </motion.div>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentTrack.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="min-w-0"
              >
                <p className="text-sm font-medium text-foreground truncate">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {currentTrack.artist}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Center - controls + seek */}
          <div className="flex-1 flex flex-col items-center gap-1.5 max-w-[560px] mx-auto relative">
            <PlayerControls />
            <div className="w-full flex items-center gap-2.5">
              <span className="text-[10px] text-muted-foreground/70 tabular-nums w-9 text-right font-medium">
                {formatDuration(currentTime)}
              </span>
              <SeekBar />
              <span className="text-[10px] text-muted-foreground/70 tabular-nums w-9 font-medium">
                {formatDuration(duration)}
              </span>
            </div>
          </div>

          {/* Right - volume + panel toggles */}
          <div className="w-[220px] flex items-center justify-end gap-1 relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleVisualizer}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                    showVisualizer
                      ? 'text-primary bg-primary/10'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label="Toggle visualizer"
                >
                  <AudioLines className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Visualizer</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => toggleRightPanel('lyrics')}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                    rightPanel === 'lyrics'
                      ? 'text-primary bg-primary/10'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label="Toggle lyrics"
                >
                  <Mic2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Lyrics</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => toggleRightPanel('queue')}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                    rightPanel === 'queue'
                      ? 'text-primary bg-primary/10'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label="Toggle queue"
                >
                  <ListMusic className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Queue</TooltipContent>
            </Tooltip>
            <div className="w-px h-5 bg-border/30 mx-1" />
            <VolumeControl />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
