import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import {
  useAppStore,
  CMP_TITLE_CLASS,
  CMP_ARTIST_CLASS,
  CMP_ALBUM_CLASS,
} from '@/stores/useAppStore';
import { cn, isRadioTrack } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { PlayerControls } from './PlayerControls';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeControl';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { useWindowControls } from '@/hooks/useWindowControls';
import { useMarqueeOnOverflow } from '@/hooks/useMarqueeOnOverflow';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import { TimeDisplay } from './TimeDisplay';
import { Heart, Maximize2, Minimize2, Music, Pin } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export function CompactPlayer() {
  const { t } = useTranslation('compact');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const duration = usePlaybackStore(s => s.duration);
  const setCompactMode = useAppStore(s => s.setCompactMode);
  const compactAlwaysOnTop = useAppStore(s => s.compactAlwaysOnTop);
  const toggleCompactAlwaysOnTop = useAppStore(s => s.toggleCompactAlwaysOnTop);
  const lowPerformanceMode = useAppStore(s => s.lowPerformanceMode);

  const compactFontSize = useAppStore(s => s.compactFontSize);
  const compactAmbientIntensity = useAppStore(s => s.compactAmbientIntensity);
  const compactShowAlbumArt = useAppStore(s => s.compactShowAlbumArt);
  const compactShowAlbum = useAppStore(s => s.compactShowAlbum);
  const compactShowSeek = useAppStore(s => s.compactShowSeek);
  const compactShowVolume = useAppStore(s => s.compactShowVolume);
  const compactShowFavorite = useAppStore(s => s.compactShowFavorite);

  const ambientColor = useAmbientColor();
  const { minimize: handleMinimize } = useWindowControls();

  const handleExitCompact = useCallback(() => {
    void setCompactMode(false);
  }, [setCompactMode]);

  const handleToggleAlwaysOnTop = useCallback(() => {
    void toggleCompactAlwaysOnTop();
  }, [toggleCompactAlwaysOnTop]);

  const nowPlayingViewEnabled = useAppStore(s => s.nowPlayingViewEnabled);
  const enterNowPlaying = useAppStore(s => s.enterNowPlaying);
  const handleAlbumArtClick = useCallback(async () => {
    // Mirror the Spotify/Apple Music mini-player gesture: clicking the art
    // exits compact and surfaces the immersive Now Playing view if the user
    // has it enabled. Otherwise just exit compact and let the regular full
    // window come back into focus.
    await setCompactMode(false);
    if (nowPlayingViewEnabled && currentTrack) {
      enterNowPlaying();
    }
  }, [setCompactMode, nowPlayingViewEnabled, enterNowPlaying, currentTrack]);

  const showSeekBar = compactShowSeek && !!currentTrack && !isRadioTrack(currentTrack.filePath);

  const titleText = currentTrack?.title ?? t('nothingPlaying');
  const artistText = currentTrack ? currentTrack.artist : t('idleSubtitle');

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {!lowPerformanceMode && compactAmbientIntensity > 0 && (
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
          <div className="size-2 shrink-0 rounded-full bg-primary/85 shadow-[0_0_10px_rgba(var(--primary-rgb),0.45)]" />
          <span className="shrink-0 font-display text-[11px] font-semibold text-foreground">
            {t('title')}
          </span>
        </div>

        <div className="no-drag flex items-center gap-1">
          {compactShowFavorite && <FavoriteButton />}

          <div className="flex items-center rounded-xl border border-border/20 bg-background/35 p-0.5 shadow-sm shadow-black/10">
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  onClick={handleToggleAlwaysOnTop}
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
                <IconButton onClick={handleExitCompact} aria-label={t('exitCompactMode')}>
                  <Maximize2 />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('exitCompactMode')}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton onClick={handleMinimize} aria-label={t('minimize')}>
                  <Minimize2 />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('minimize')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center p-2.5">
        <div className="glass-subtle relative flex h-full w-full items-stretch gap-2.5 overflow-hidden rounded-[20px] border border-border/25 p-2.5">
          {compactShowAlbumArt && (
            <button
              type="button"
              onClick={handleAlbumArtClick}
              className="group/art flex size-[72px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-muted shadow-lg shadow-black/20 transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={t('expandFromCompact')}
            >
              {currentTrack?.albumArt ? (
                <img
                  src={currentTrack.albumArt}
                  alt={currentTrack.album}
                  className="h-full w-full object-cover transition-opacity group-hover/art:opacity-90"
                />
              ) : (
                <Music className="size-7 text-muted-foreground/45 transition-colors group-hover/art:text-muted-foreground/70" />
              )}
            </button>
          )}

          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div className="min-w-0">
              <MarqueeText
                text={titleText}
                className={cn(
                  'text-foreground',
                  CMP_TITLE_CLASS[compactFontSize],
                  !currentTrack && 'text-muted-foreground'
                )}
              />
              <MarqueeText
                text={artistText}
                className={cn('mt-0.5 text-muted-foreground', CMP_ARTIST_CLASS[compactFontSize])}
              />
              {compactShowAlbum && currentTrack?.album && (
                <MarqueeText
                  text={currentTrack.album}
                  className={cn('mt-1 text-muted-foreground/65', CMP_ALBUM_CLASS[compactFontSize])}
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
                    {formatDuration(duration)}
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
    </div>
  );
}

/**
 * Compact-mode favorite button. Lives in the title bar so the user can heart
 * the current track without expanding the window. Hidden for radio tracks and
 * when nothing is playing. Shuffle/repeat are intentionally NOT here — they
 * already live in the main PlayerControls row below to avoid duplication.
 */
function FavoriteButton() {
  const { t: tp } = useTranslation('player');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);

  if (!currentTrack || isRadioTrack(currentTrack.filePath)) return null;

  return (
    <div className="flex items-center rounded-xl border border-border/20 bg-background/35 p-0.5 shadow-sm shadow-black/10">
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            onClick={() => toggleFavorite(currentTrack.id)}
            className={cn(
              currentTrack.isFavorite &&
                'text-favorite hover:bg-favorite/10 hover:text-favorite-hover'
            )}
            aria-label={currentTrack.isFavorite ? tp('removeFromFavorites') : tp('addToFavorites')}
          >
            <Heart className={cn(currentTrack.isFavorite && 'fill-current')} />
          </IconButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {currentTrack.isFavorite ? tp('unfavorite') : tp('favorite')}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

interface MarqueeTextProps {
  text: string;
  className?: string;
}

/**
 * Single-line text that scrolls horizontally on hover when it overflows.
 *
 * Static state: the parent clips with `overflow:hidden` and a horizontal
 * mask-image fades the right edge so the cut feels intentional (no ellipsis,
 * since the marquee target is an inline-block child).
 *
 * Active state (hover/focus): the inner span animates by exactly its measured
 * `scrollWidth - clientWidth` overflow distance, returns home, repeats.
 *
 * Falls back to a static line under `lowPerformanceMode` to honor that user
 * preference. Tooltip still surfaces the full text for screen readers and
 * mouse users in either mode.
 */
function MarqueeText({ text, className }: MarqueeTextProps) {
  // Ref must be on the clipped parent (`<p>`), not the inline-block span.
  // scrollWidth/clientWidth on the unconstrained span are equal — the
  // overflow signal lives on the constrained container.
  const { ref, overflows, shift } = useMarqueeOnOverflow<HTMLParagraphElement>(text);
  const lowPerformanceMode = useAppStore(s => s.lowPerformanceMode);
  const animate = overflows && !lowPerformanceMode;

  return (
    <p
      ref={ref}
      tabIndex={overflows ? 0 : -1}
      className={cn(
        'group/marquee block w-full overflow-hidden whitespace-nowrap focus:outline-none',
        overflows &&
          '[mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]',
        className
      )}
      title={overflows ? text : undefined}
    >
      <span
        className={cn(
          'inline-block whitespace-nowrap will-change-transform',
          animate &&
            'group-hover/marquee:animate-marquee group-focus-visible/marquee:animate-marquee'
        )}
        style={animate ? ({ '--marquee-shift': `${shift}px` } as React.CSSProperties) : undefined}
      >
        {text}
      </span>
    </p>
  );
}
