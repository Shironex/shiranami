import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useTrack } from '@/hooks/useTrack';
import { useUIStore } from '@/stores/useUIStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { useViewStore } from '@/stores/useViewStore';
import { cn, isRadioTrack } from '@/lib/utils';
import { PLAYER_BAR_HEIGHT } from '@/lib/layout';
import { formatDuration } from '@shiranami/shared';
import { PlayerControls } from './PlayerControls';
import { SeekBar } from './SeekBar';
import { WaveformSeekbar } from './WaveformSeekbar';
import { VolumeControl } from './VolumeControl';
import { SleepTimer } from './SleepTimer';
import { EqualizerPanel } from './EqualizerPanel';
import { PlayerOverflowMenu } from './PlayerOverflowMenu';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { Music, Mic2, ListMusic, AudioLines, Minimize2, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';

import { TimeDisplay } from './TimeDisplay';

const MOD = navigator.platform.toUpperCase().includes('MAC') ? '\u2318' : 'Ctrl';

export function PlayerBar() {
  const { t } = useTranslation('player');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  // Heart state reads through the overlay so a toggle from any surface
  // reflects on the player bar without re-allocating `library`.
  const mergedTrack = useTrack(currentTrack?.id, currentTrack);
  const isFavorite = mergedTrack?.isFavorite ?? currentTrack?.isFavorite;
  const duration = usePlaybackStore(s => s.duration);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const ambientColor = useAmbientColor();
  const rightPanel = useViewStore(s => s.rightPanel);
  const toggleRightPanel = useViewStore(s => s.toggleRightPanel);
  const showVisualizer = useUIStore(s => s.showVisualizer);
  const toggleVisualizer = useUIStore(s => s.toggleVisualizer);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const setCompactMode = useCompactStore(s => s.setCompactMode);
  const nowPlayingViewEnabled = useUIStore(s => s.nowPlayingViewEnabled);
  const enterNowPlaying = useViewStore(s => s.enterNowPlaying);

  // Element visibility (Settings · Interface · Player bar). Core playback
  // controls and the seek bar are not toggleable.
  const showAlbumArt = useInterfaceStore(s => s.playerAlbumArt);
  const showFavorite = useInterfaceStore(s => s.playerFavorite);
  const showTimeLabels = useInterfaceStore(s => s.playerTimeLabels);
  const showSleepTimer = useInterfaceStore(s => s.playerSleepTimer);
  const showEqualizer = useInterfaceStore(s => s.playerEqualizer);
  const showCompactButton = useInterfaceStore(s => s.playerCompactButton);
  const showVisualizerButton = useInterfaceStore(s => s.playerVisualizerButton);
  const showLyricsButton = useInterfaceStore(s => s.playerLyricsButton);
  const showQueueButton = useInterfaceStore(s => s.playerQueueButton);
  const showVolume = useInterfaceStore(s => s.playerVolume);
  const showWaveformSeekbar = useInterfaceStore(s => s.playerWaveformSeekbar);

  const hasUtilityButtons =
    showSleepTimer || showEqualizer || showCompactButton || showVisualizerButton;
  const hasButtonCluster = hasUtilityButtons || showLyricsButton || showQueueButton;

  return (
    <AnimatePresence>
      {currentTrack && (
        <motion.div
          initial={{ y: PLAYER_BAR_HEIGHT, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: PLAYER_BAR_HEIGHT, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          style={{ height: PLAYER_BAR_HEIGHT }}
          className={cn(
            'absolute bottom-0 left-0 right-0 z-50',
            'px-5',
            'flex items-center gap-5',
            'glass border-t border-border/30'
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

          {/* Track info - left (adaptive width) */}
          <div className="flex items-center gap-3 min-[900px]:gap-3.5 w-[180px] min-[900px]:w-[220px] min-[1200px]:w-[280px] min-w-0 relative">
            {showAlbumArt && (
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
                  <TrackThumbnail
                    fill
                    albumArt={currentTrack.albumArt}
                    alt={currentTrack.album}
                    fallback={<Music className="w-6 h-6 text-muted-foreground/50" />}
                  />
                </motion.div>
              </AnimatePresence>
            )}

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
                <p className="text-xs text-muted-foreground truncate mt-0.5 hidden min-[900px]:block">
                  {currentTrack.artist}
                </p>
              </motion.div>
            </AnimatePresence>

            {showFavorite && !isRadioTrack(currentTrack.filePath) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => toggleFavorite(currentTrack.id)}
                    className={cn(
                      'shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                      isFavorite
                        ? 'text-favorite hover:text-favorite-hover'
                        : 'text-muted-foreground/40 hover:text-muted-foreground'
                    )}
                    aria-label={isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
                  >
                    <Heart className={cn('w-4 h-4', isFavorite && 'fill-current')} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isFavorite ? t('unfavorite') : t('favorite')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Center - controls + seek */}
          <div className="flex-1 flex flex-col items-center gap-1.5 max-w-[560px] mx-auto relative">
            <PlayerControls />
            {!(currentTrack && isRadioTrack(currentTrack.filePath)) && (
              <div className="w-full flex items-center gap-2.5">
                {showTimeLabels && (
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums w-9 text-right font-medium">
                    <TimeDisplay />
                  </span>
                )}
                {showWaveformSeekbar ? <WaveformSeekbar /> : <SeekBar />}
                {showTimeLabels && (
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums w-9 font-medium">
                    {formatDuration(duration)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right - volume + panel toggles (adaptive) */}
          <div className="shrink-0 min-[900px]:w-[264px] flex items-center justify-end gap-2 min-[900px]:gap-2.5 relative">
            {hasButtonCluster && (
              <div className="glass-subtle flex items-center gap-0.5 rounded-xl border border-border/20 p-1">
                {/* Collapsed into overflow on < 900px */}
                {hasUtilityButtons && (
                  <div className="flex items-center gap-0.5 min-[900px]:hidden">
                    <PlayerOverflowMenu />
                  </div>
                )}

                {/* Expanded inline on >= 900px */}
                {hasUtilityButtons && (
                  <div className="hidden min-[900px]:flex items-center gap-0.5">
                    {showSleepTimer && <SleepTimer />}
                    {showEqualizer && <EqualizerPanel />}
                    {showCompactButton && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton
                            onClick={() => void setCompactMode(true)}
                            aria-label={t('compactMode')}
                          >
                            <Minimize2 />
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {t('compactModeTooltip', { shortcut: `${MOD}+Shift+M` })}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {showVisualizerButton && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton
                            onClick={toggleVisualizer}
                            className={cn(
                              showVisualizer &&
                                'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
                            )}
                            aria-label={t('toggleVisualizer')}
                          >
                            <AudioLines />
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent side="top">{t('visualizerTooltip')}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}

                {/* Highest-priority actions — hideable, but shown by default */}
                {showLyricsButton && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        onClick={() => toggleRightPanel('lyrics')}
                        className={cn(
                          rightPanel === 'lyrics' &&
                            'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
                        )}
                        aria-label={t('toggleLyrics')}
                      >
                        <Mic2 />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {t('lyricsTooltip', { shortcut: `${MOD}+L` })}
                    </TooltipContent>
                  </Tooltip>
                )}
                {showQueueButton && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        onClick={() => toggleRightPanel('queue')}
                        className={cn(
                          rightPanel === 'queue' &&
                            'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
                        )}
                        aria-label={t('toggleQueue')}
                      >
                        <ListMusic />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {t('queueTooltip', { shortcut: `${MOD}+Q` })}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
            {showVolume && <VolumeControl sliderClassName="w-20" />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
