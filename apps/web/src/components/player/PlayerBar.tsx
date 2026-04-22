import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';
import { cn, isRadioTrack } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { PlayerControls } from './PlayerControls';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeControl';
import { SleepTimer } from './SleepTimer';
import { EqualizerPanel } from './EqualizerPanel';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { Music, Mic2, ListMusic, AudioLines, Minimize2, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

import { TimeDisplay } from './TimeDisplay';

const MOD = navigator.platform.toUpperCase().includes('MAC') ? '\u2318' : 'Ctrl';

export function PlayerBar() {
  const { t } = useTranslation('player');
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const duration = usePlayerStore(s => s.duration);
  const toggleFavorite = usePlayerStore(s => s.toggleFavorite);
  const ambientColor = useAmbientColor();
  const rightPanel = useAppStore(s => s.rightPanel);
  const toggleRightPanel = useAppStore(s => s.toggleRightPanel);
  const showVisualizer = useAppStore(s => s.showVisualizer);
  const toggleVisualizer = useAppStore(s => s.toggleVisualizer);
  const lowPerformanceMode = useAppStore(s => s.lowPerformanceMode);
  const setCompactMode = useAppStore(s => s.setCompactMode);
  const nowPlayingViewEnabled = useAppStore(s => s.nowPlayingViewEnabled);
  const enterNowPlaying = useAppStore(s => s.enterNowPlaying);

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
          {/* Ambient glow — skipped in low performance mode */}
          {!lowPerformanceMode && (
            <div
              className="absolute inset-0 opacity-[0.06] pointer-events-none rounded-none transition-all duration-[2s]"
              style={{
                background: `radial-gradient(ellipse at 15% 50%, rgba(${ambientColor.rgb}, 0.9) 0%, transparent 60%)`,
              }}
            />
          )}

          {/* Track info - left */}
          <div className="flex items-center gap-3.5 w-[280px] min-w-0 relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTrack.id}
                initial={{ scale: 0.85, opacity: 0, rotate: -3 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.85, opacity: 0, rotate: 3 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                onDoubleClick={nowPlayingViewEnabled ? enterNowPlaying : undefined}
                className={cn(
                  'w-14 h-14 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden shadow-lg shadow-black/20',
                  nowPlayingViewEnabled && 'cursor-pointer'
                )}
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
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {currentTrack.title}
                  </p>
                  {isRadioTrack(currentTrack.filePath) && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[9px] font-semibold uppercase tracking-wider shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                      {t('live')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {currentTrack.artist}
                </p>
              </motion.div>
            </AnimatePresence>

            {!isRadioTrack(currentTrack.filePath) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => toggleFavorite(currentTrack.id)}
                    className={cn(
                      'shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                      currentTrack.isFavorite
                        ? 'text-favorite hover:text-favorite-hover'
                        : 'text-muted-foreground/40 hover:text-muted-foreground'
                    )}
                    aria-label={currentTrack.isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
                  >
                    <Heart className={cn('w-4 h-4', currentTrack.isFavorite && 'fill-current')} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {currentTrack.isFavorite ? t('unfavorite') : t('favorite')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Center - controls + seek */}
          <div className="flex-1 flex flex-col items-center gap-1.5 max-w-[560px] mx-auto relative">
            <PlayerControls />
            {!(currentTrack && isRadioTrack(currentTrack.filePath)) && (
              <div className="w-full flex items-center gap-2.5">
                <span className="text-[10px] text-muted-foreground/70 tabular-nums w-9 text-right font-medium">
                  <TimeDisplay />
                </span>
                <SeekBar />
                <span className="text-[10px] text-muted-foreground/70 tabular-nums w-9 font-medium">
                  {formatDuration(duration)}
                </span>
              </div>
            )}
          </div>

          {/* Right - volume + panel toggles */}
          <div className="w-[264px] flex items-center justify-end gap-2.5 relative">
            <div className="glass-subtle flex items-center gap-0.5 rounded-xl border border-border/20 p-1">
              <SleepTimer />
              <EqualizerPanel />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => void setCompactMode(true)}
                    className="size-7 flex items-center justify-center rounded-lg text-muted-foreground/75 hover:bg-accent hover:text-foreground transition-colors"
                    aria-label={t('compactMode')}
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t('compactModeTooltip', { shortcut: `${MOD}+Shift+M` })}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleVisualizer}
                    className={cn(
                      'size-7 flex items-center justify-center rounded-lg transition-colors',
                      showVisualizer
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground/75 hover:bg-accent hover:text-foreground'
                    )}
                    aria-label={t('toggleVisualizer')}
                  >
                    <AudioLines className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t('visualizerTooltip')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => toggleRightPanel('lyrics')}
                    className={cn(
                      'size-7 flex items-center justify-center rounded-lg transition-colors',
                      rightPanel === 'lyrics'
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground/75 hover:bg-accent hover:text-foreground'
                    )}
                    aria-label={t('toggleLyrics')}
                  >
                    <Mic2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t('lyricsTooltip', { shortcut: `${MOD}+L` })}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => toggleRightPanel('queue')}
                    className={cn(
                      'size-7 flex items-center justify-center rounded-lg transition-colors',
                      rightPanel === 'queue'
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground/75 hover:bg-accent hover:text-foreground'
                    )}
                    aria-label={t('toggleQueue')}
                  >
                    <ListMusic className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t('queueTooltip', { shortcut: `${MOD}+Q` })}</TooltipContent>
              </Tooltip>
            </div>
            <VolumeControl sliderClassName="w-20" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
