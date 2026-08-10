import { cn, isRadioTrack } from '@/lib/utils';
import { PLAYER_BAR_HEIGHT } from '@/lib/layout';
import { Music, Mic2, ListMusic, AudioLines, Minimize2, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SCALE_ICON } from '@/lib/motion';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { CompanionPerch } from '@/components/companion/CompanionPerch';
import { FavoriteBurst } from '../FavoriteBurst';
import { PlayerControls } from '../PlayerControls';
import { SeekBar } from '../SeekBar';
import { WaveformSeekbar } from '../WaveformSeekbar';
import { VolumeControl } from '../VolumeControl';
import { SleepTimer } from '../SleepTimer';
import { EqualizerPanel } from '../EqualizerPanel';
import { PlayerOverflowMenu } from '../PlayerOverflowMenu';
import { TimeDisplay } from '../TimeDisplay';
import { usePlayerBar } from './PlayerBar.hooks';

export default function PlayerBar() {
  const {
    t,
    currentTrack,
    titleText,
    isFavorite,
    showSeekRow,
    ambientColor,
    lowPerformanceMode,
    durationLabel,
    showAlbumArt,
    showFavoriteButton,
    showTimeLabels,
    showSleepTimer,
    showEqualizer,
    showCompactButton,
    showVisualizerButton,
    showLyricsButton,
    showQueueButton,
    showVolume,
    showWaveformSeekbar,
    hasUtilityButtons,
    hasButtonCluster,
    nowPlayingViewEnabled,
    showVisualizer,
    lyricsActive,
    queueActive,
    compactTooltip,
    visualizerTooltip,
    lyricsTooltip,
    queueTooltip,
    heartControls,
    favoriteBurst,
    showFavoriteBurst,
    onToggleFavorite,
    onEnterCompact,
    onToggleVisualizer,
    onToggleLyrics,
    onToggleQueue,
    onEnterNowPlaying,
  } = usePlayerBar();

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
          {/* The resident sits on the bar's top edge, feet over the border. */}
          <CompanionPerch />

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
                  onDoubleClick={nowPlayingViewEnabled ? onEnterNowPlaying : undefined}
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
                  <p className="text-sm font-medium text-foreground truncate">{titleText}</p>
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

            {showFavoriteButton && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    whileTap={SCALE_ICON}
                    onClick={onToggleFavorite}
                    className={cn(
                      'relative shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                      isFavorite
                        ? 'text-favorite hover:text-favorite-hover'
                        : 'text-muted-foreground/40 hover:text-muted-foreground'
                    )}
                    aria-label={isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
                  >
                    {showFavoriteBurst && <FavoriteBurst burstKey={favoriteBurst} />}
                    <motion.span animate={heartControls} className="inline-flex">
                      <Heart className={cn('w-4 h-4', isFavorite && 'fill-current')} />
                    </motion.span>
                  </motion.button>
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
            {showSeekRow && (
              <div className="w-full flex items-center gap-2.5">
                {showTimeLabels && (
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums w-9 text-right font-medium">
                    <TimeDisplay />
                  </span>
                )}
                {showWaveformSeekbar ? <WaveformSeekbar /> : <SeekBar />}
                {showTimeLabels && (
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums w-9 font-medium">
                    {durationLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right - volume + panel toggles (adaptive). Rides the transport-controls
              band: the phantom lane below mirrors the seek row's height so the
              buttons stay level with the controls instead of crowding the seekbar. */}
          <div className="shrink-0 min-[900px]:w-[264px] flex flex-col items-end gap-1.5 relative">
            <div className="flex items-center gap-2 min-[900px]:gap-2.5">
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
                            <IconButton onClick={onEnterCompact} aria-label={t('compactMode')}>
                              <Minimize2 />
                            </IconButton>
                          </TooltipTrigger>
                          <TooltipContent side="top">{compactTooltip}</TooltipContent>
                        </Tooltip>
                      )}
                      {showVisualizerButton && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <IconButton
                              onClick={onToggleVisualizer}
                              className={cn(
                                showVisualizer &&
                                  'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
                              )}
                              aria-label={t('toggleVisualizer')}
                            >
                              <AudioLines />
                            </IconButton>
                          </TooltipTrigger>
                          <TooltipContent side="top">{visualizerTooltip}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  )}

                  {/* Highest-priority actions — hideable, but shown by default */}
                  {showLyricsButton && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <IconButton
                          onClick={onToggleLyrics}
                          className={cn(
                            lyricsActive &&
                              'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
                          )}
                          aria-label={t('toggleLyrics')}
                        >
                          <Mic2 />
                        </IconButton>
                      </TooltipTrigger>
                      <TooltipContent side="top">{lyricsTooltip}</TooltipContent>
                    </Tooltip>
                  )}
                  {showQueueButton && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <IconButton
                          onClick={onToggleQueue}
                          className={cn(
                            queueActive &&
                              'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
                          )}
                          aria-label={t('toggleQueue')}
                        >
                          <ListMusic />
                        </IconButton>
                      </TooltipTrigger>
                      <TooltipContent side="top">{queueTooltip}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
              {showVolume && <VolumeControl sliderClassName="w-20" />}
            </div>
            {/* Phantom seek-row lane: h-7 matches WaveformSeekbar's canvas,
                h-3 matches SeekBar's py-1 + h-1 track. */}
            {showSeekRow && <div aria-hidden className={showWaveformSeekbar ? 'h-7' : 'h-3'} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
