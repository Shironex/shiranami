import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { Maximize2, Mic2, Minimize2, Music, Pin } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { PlayerControls } from '../PlayerControls';
import { SeekBar } from '../SeekBar';
import { VolumeControl } from '../VolumeControl';
import { TimeDisplay } from '../TimeDisplay';
import { CompactFavoriteButton } from './CompactFavoriteButton';
import { CompactMarqueeText } from './CompactMarqueeText';
import { useCompactPlayer } from './CompactPlayer.hooks';

// Lazy so the lyrics panel (and its lyrics data layer) stays out of the eager
// bundle. App.tsx already lazy-imports this module; a static import here would
// win and pull it back in eagerly, which is the [INEFFECTIVE_DYNAMIC_IMPORT]
// the build used to warn about. It only renders when the user opens lyrics.
const LyricsPanel = lazy(() => import('@/components/lyrics/LyricsPanel/LyricsPanel'));

// TODO(companion): the resident deliberately skips the compact player for now
// — at 500×214 a 40px sprite may be one element too many. Prototype a corner
// perch in situ and either commit or cut it (research-visual Part 6).

export default function CompactPlayer() {
  const {
    t,
    currentTrack,
    titleText,
    artistText,
    durationLabel,
    ambientColor,
    compactAmbientIntensity,
    showAmbient,
    lowPerformanceMode,
    breathing,
    compactShowAlbumArt,
    showAlbumLine,
    albumName,
    compactShowVolume,
    compactShowFavorite,
    compactShowLyrics,
    showSeekBar,
    lyricsOpen,
    showLyricsPanel,
    compactAlwaysOnTop,
    titleClass,
    artistClass,
    albumClass,
    lyricsButtonRef,
    lyricsPanelRef,
    onToggleLyrics,
    onToggleAlwaysOnTop,
    onExitCompact,
    onMinimize,
    onAlbumArtClick,
    onLyricsKeyDown,
  } = useCompactPlayer();

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {showAmbient && (
        <AnimatePresence>
          <motion.div
            key={ambientColor.hex}
            initial={{ opacity: 0 }}
            animate={{ opacity: compactAmbientIntensity }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle at 18% 24%, rgba(${ambientColor.rgb}, 0.95) 0%, transparent 48%)`,
            }}
          />
        </AnimatePresence>
      )}

      <div className="drag flex h-9 shrink-0 items-center justify-between border-b border-border/20 px-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* Tempo breathing: the dot pulses at the track's folded bar period
              while breathing is active; steady otherwise, exactly as before. */}
          <div
            className={`size-2 shrink-0 rounded-full bg-primary/85 shadow-[0_0_10px_rgba(var(--primary-rgb),0.45)]${breathing ? ' pulse-beat' : ''}`}
            data-breathing={breathing || undefined}
          />
          <span className="shrink-0 font-display text-[11px] font-semibold text-foreground">
            {t('title')}
          </span>
        </div>

        <div className="no-drag flex items-center gap-1">
          {compactShowFavorite && <CompactFavoriteButton />}

          <div className="flex items-center rounded-xl border border-border/20 bg-background/35 p-0.5 shadow-sm shadow-black/10">
            {compactShowLyrics && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    ref={lyricsButtonRef}
                    onClick={onToggleLyrics}
                    className={cn(
                      lyricsOpen &&
                        'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary'
                    )}
                    aria-label={lyricsOpen ? t('hideLyrics') : t('showLyrics')}
                    aria-pressed={lyricsOpen}
                  >
                    <Mic2 />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {lyricsOpen ? t('hideLyrics') : t('showLyrics')}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  onClick={onToggleAlwaysOnTop}
                  className={cn(
                    compactAlwaysOnTop &&
                      'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary'
                  )}
                  aria-label={compactAlwaysOnTop ? t('disableAlwaysOnTop') : t('enableAlwaysOnTop')}
                >
                  <Pin />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {compactAlwaysOnTop ? t('disableOnTop') : t('keepOnTop')}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton onClick={onExitCompact} aria-label={t('exitCompactMode')}>
                  <Maximize2 />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('exitCompactMode')}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton onClick={onMinimize} aria-label={t('minimize')}>
                  <Minimize2 />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('minimize')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'relative flex items-center p-2.5',
          // When lyrics are open the window has grown: keep the player at its
          // natural height up top so the lyrics panel takes the new space
          // below. Otherwise the player fills (and vertically centers in) the
          // short window as before.
          lyricsOpen ? 'shrink-0' : 'min-h-0 flex-1'
        )}
      >
        <div
          className={cn(
            'glass-subtle relative flex w-full items-stretch gap-2.5 overflow-hidden rounded-[20px] border border-border/25 p-2.5',
            lyricsOpen ? 'h-auto' : 'h-full'
          )}
        >
          {compactShowAlbumArt && (
            <button
              type="button"
              onClick={onAlbumArtClick}
              className="group/art flex size-[72px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-muted shadow-lg shadow-black/20 transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={t('expandFromCompact')}
            >
              <TrackThumbnail
                fill
                albumArt={currentTrack?.albumArt}
                alt={currentTrack?.album ?? ''}
                imgClassName="transition-opacity group-hover/art:opacity-90"
                fallback={
                  <Music className="size-7 text-muted-foreground/45 transition-colors group-hover/art:text-muted-foreground/70" />
                }
              />
            </button>
          )}

          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div className="min-w-0">
              <CompactMarqueeText
                text={titleText}
                className={cn(
                  'text-foreground',
                  titleClass,
                  !currentTrack && 'text-muted-foreground'
                )}
              />
              <CompactMarqueeText
                text={artistText}
                className={cn('mt-0.5 text-muted-foreground', artistClass)}
              />
              {showAlbumLine && (
                <CompactMarqueeText
                  text={albumName}
                  className={cn('mt-1 text-muted-foreground/65', albumClass)}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center gap-3.5">
                <PlayerControls />
                {compactShowVolume && <VolumeControl sliderClassName="w-20" />}
              </div>

              {showSeekBar ? (
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="w-7 text-right text-[10px] font-medium tabular-nums text-muted-foreground/70">
                    <TimeDisplay />
                  </span>
                  <div className="min-w-0 flex-1">
                    <SeekBar />
                  </div>
                  <span className="w-7 text-[10px] font-medium tabular-nums text-muted-foreground/70">
                    {durationLabel}
                  </span>
                </div>
              ) : (
                // Reserve the height even when seek is hidden so the layout
                // doesn't collapse and re-jitter on track-type changes.
                <div className="h-6" />
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showLyricsPanel && (
          <motion.div
            ref={lyricsPanelRef}
            key="compact-lyrics"
            role="region"
            aria-label={t('lyricsTitle')}
            tabIndex={-1}
            onKeyDown={onLyricsKeyDown}
            initial={lowPerformanceMode ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: lowPerformanceMode ? 0.1 : 0.2 }}
            className="relative z-10 flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 focus:outline-none"
          >
            <div className="glass-panel h-full overflow-hidden rounded-2xl border border-border/25 shadow-lg shadow-black/20">
              <Suspense fallback={null}>
                <LyricsPanel />
              </Suspense>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
