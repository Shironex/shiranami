import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore, type NowPlayingPanel } from '@/stores/useUIStore';
import { useLyricsAppearanceStore, type LyricsFontSize } from '@/stores/useLyricsAppearanceStore';
import { useViewStore } from '@/stores/useViewStore';
import { useLyricsView } from '@/hooks/useLyricsView';
import { LyricsBody } from '@/components/lyrics/LyricsBody';
import { QueuePanel } from '@/components/player/QueuePanel';
import { EqualizerPanel } from '@/components/player/EqualizerPanel';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { PlayerControls } from '@/components/player/PlayerControls';
import { SeekBar } from '@/components/player/SeekBar';
import { VolumeControl } from '@/components/player/VolumeControl';
import { TimeDisplay } from '@/components/player/TimeDisplay';
import { Music, ArrowLeft, Mic2, ListMusic, SlidersVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import type { LucideIcon } from 'lucide-react';

const NP_PLAIN_SIZE_CLASS: Record<LyricsFontSize, string> = {
  sm: 'text-xs @5xl:text-sm @7xl:text-base',
  base: 'text-sm @5xl:text-base @7xl:text-lg',
  lg: 'text-base @5xl:text-lg @7xl:text-xl',
  xl: 'text-lg @5xl:text-xl @7xl:text-2xl',
};

const NP_SYNCED_BASE_SIZE_CLASS: Record<LyricsFontSize, string> = {
  sm: 'text-sm @5xl:text-base @7xl:text-lg',
  base: 'text-base @5xl:text-lg @7xl:text-xl',
  lg: 'text-lg @5xl:text-xl @7xl:text-2xl',
  xl: 'text-xl @5xl:text-2xl @7xl:text-3xl',
};

const NP_SYNCED_ACTIVE_SIZE_CLASS: Record<LyricsFontSize, string> = {
  sm: 'text-lg @5xl:!text-xl @7xl:!text-2xl',
  base: 'text-xl @5xl:!text-2xl @7xl:!text-3xl',
  lg: 'text-2xl @5xl:!text-3xl @7xl:!text-4xl',
  xl: 'text-3xl @5xl:!text-4xl @7xl:!text-4xl',
};

const NP_BASE_SHARED =
  'block w-full text-left leading-relaxed font-medium cursor-pointer transition-all duration-500 rounded-md px-1 -mx-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40';

const NP_IDLE = 'text-foreground opacity-[var(--lyrics-idle-opacity)] hover:opacity-100';
const NP_PAST = 'text-foreground opacity-[var(--lyrics-past-opacity)]';

type ActivePanel = Exclude<NowPlayingPanel, null>;

const PANEL_ORDER: ActivePanel[] = ['lyrics', 'queue', 'eq'];

const PANEL_META: Record<
  ActivePanel,
  { icon: LucideIcon; labelKey: string; showKey: string; hideKey: string }
> = {
  lyrics: { icon: Mic2, labelKey: 'lyrics', showKey: 'showLyrics', hideKey: 'hideLyrics' },
  queue: { icon: ListMusic, labelKey: 'queue', showKey: 'showQueue', hideKey: 'hideQueue' },
  eq: { icon: SlidersVertical, labelKey: 'eq', showKey: 'showEq', hideKey: 'hideEq' },
};

export function NowPlayingView() {
  const { t } = useTranslation('nowPlaying');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const duration = usePlaybackStore(s => s.duration);
  const exitNowPlaying = useViewStore(s => s.exitNowPlaying);
  const panel = useUIStore(s => s.nowPlayingPanel);
  const togglePanel = useUIStore(s => s.toggleNowPlayingPanel);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const lyricsPlainOpacity = useLyricsAppearanceStore(s => s.lyricsPlainOpacity);
  const lyricsPlainFontSize = useLyricsAppearanceStore(s => s.lyricsPlainFontSize);
  const lyricsSyncedDimOpacity = useLyricsAppearanceStore(s => s.lyricsSyncedDimOpacity);
  const lyricsSyncedFontSize = useLyricsAppearanceStore(s => s.lyricsSyncedFontSize);

  const npBase = cn(NP_BASE_SHARED, NP_SYNCED_BASE_SIZE_CLASS[lyricsSyncedFontSize]);
  const npActive = cn(
    'text-foreground font-semibold',
    NP_SYNCED_ACTIVE_SIZE_CLASS[lyricsSyncedFontSize]
  );

  const { synced, plain, activeLine, isLoading: lyricsLoading, handleLineClick } = useLyricsView();

  const panelVisible = panel !== null;

  // Exit if no track is playing
  useEffect(() => {
    if (!currentTrack) {
      exitNowPlaying();
    }
  }, [currentTrack, exitNowPlaying]);

  if (!currentTrack) return null;

  return (
    <div className="@container flex-1 flex flex-col overflow-hidden relative">
      {/* Ambient gradient is painted globally by <AmbientBackground /> — no local duplicate here. */}

      {/* Header: back button + lyrics / queue / EQ segmented toggle group */}
      <div className="relative px-6 @3xl:px-10 pt-4 pb-2 shrink-0 flex items-center justify-between">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={exitNowPlaying}
          // glass-subtle backing matches the panel-toggle group on the right and
          // keeps the icon legible: this button sits over the bare theme image,
          // so a transparent background washes out on bright themes (summer).
          className="glass-subtle rounded-lg border border-border/20 p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={t('back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </motion.button>

        <div
          role="group"
          aria-label={t('panelGroup')}
          className="glass-subtle flex items-center gap-0.5 rounded-xl border border-border/20 p-1"
        >
          {PANEL_ORDER.map(id => {
            const meta = PANEL_META[id];
            const Icon = meta.icon;
            const isActive = panel === id;
            const label = isActive ? t(meta.hideKey) : t(meta.showKey);
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <IconButton
                    onClick={() => togglePanel(id)}
                    className={cn(
                      isActive
                        ? 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
                        : 'text-muted-foreground/60 hover:bg-accent/40'
                    )}
                    aria-label={label}
                    aria-pressed={isActive}
                  >
                    <Icon />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Main content: stacked on narrow, side-by-side on wide */}
      <div
        className={cn(
          'flex-1 min-h-0 relative flex',
          'flex-col @3xl:flex-row',
          panelVisible
            ? 'gap-4 @3xl:gap-8 @5xl:gap-12 @7xl:gap-16 px-6 @3xl:px-10 @5xl:px-14 @7xl:px-20'
            : 'justify-center px-8'
        )}
      >
        {/* Left column / top section: Album art + info + controls */}
        <div
          className={cn(
            'flex flex-col items-center shrink-0',
            'gap-4 @3xl:gap-5 @5xl:gap-7 @7xl:gap-8',
            // Narrow: stacked top, wide: vertically centered in left column
            'justify-start @3xl:justify-center',
            'py-4 @3xl:py-8 @5xl:py-10 @7xl:py-14',
            // Narrow: full-width auto-centered; wide: fixed percentage that scales up
            panelVisible
              ? 'w-full max-w-[460px] mx-auto @3xl:mx-0 @3xl:w-[42%] @3xl:max-w-[420px] @5xl:max-w-[500px] @6xl:max-w-[580px] @7xl:max-w-[640px]'
              : 'w-full max-w-[520px] @5xl:max-w-[580px] @7xl:max-w-[640px] py-6 @5xl:py-10'
          )}
        >
          {/* Album art — scales dramatically with container */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTrack.id}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 250 }}
              className={cn(
                'shrink-0 aspect-square rounded-2xl @5xl:rounded-3xl overflow-hidden',
                'shadow-2xl shadow-black/40 bg-muted flex items-center justify-center',
                // The art is sized by max-width, and the box is aspect-square, so
                // capping max-width also caps its height. The `calc(100vh - …)`
                // term is a height budget that reserves room for the header, track
                // info, seek bar and controls: on tall viewports the width clamp
                // wins (art stays large), but on short ones (e.g. a 1080p screen at
                // 150% display scaling → ~720px tall) the height budget wins and
                // shrinks the art so the controls always clear the window bottom
                // instead of sliding under the OS taskbar.
                panelVisible
                  ? 'w-[55%] min-w-[180px] max-w-[240px] @3xl:w-full @3xl:max-w-[min(calc(100vh_-_28rem),clamp(280px,22vw,480px))]'
                  : 'w-full max-w-[min(calc(100vh_-_30rem),clamp(300px,24vw,440px))]'
              )}
            >
              {currentTrack.albumArt ? (
                <img
                  src={currentTrack.albumArt}
                  alt={currentTrack.album}
                  className="w-full h-full object-cover"
                  decoding="async"
                />
              ) : (
                <Music className="w-16 h-16 text-muted-foreground/30" />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Track info */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTrack.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="text-center w-full max-w-[360px] @5xl:max-w-[420px] px-2"
            >
              <h1 className="font-serif italic text-2xl @5xl:text-3xl @7xl:text-4xl text-foreground truncate">
                {currentTrack.title}
              </h1>
              <p className="text-xs @5xl:text-sm @7xl:text-base text-muted-foreground mt-1 truncate">
                {currentTrack.artist} · {currentTrack.album}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Seek bar + time */}
          <div className="w-full max-w-[340px] @5xl:max-w-[400px] @7xl:max-w-[460px] px-2">
            <SeekBar />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] @5xl:text-xs text-muted-foreground/60 tabular-nums font-medium">
                <TimeDisplay />
              </span>
              <span className="text-[10px] @5xl:text-xs text-muted-foreground/60 tabular-nums font-medium">
                {formatDuration(duration)}
              </span>
            </div>
          </div>

          {/* Controls + volume in one row */}
          <div className="flex items-center gap-2 @5xl:gap-3 flex-wrap justify-center">
            <PlayerControls />
            <div className="w-px h-5 bg-border/30" />
            <VolumeControl sliderClassName="w-16 @5xl:w-20 @7xl:w-24" />
          </div>
        </div>

        {/* Right column / bottom section: active panel (lyrics / queue / EQ). */}
        {panelVisible && (
          <div className="flex-1 min-w-0 flex flex-col min-h-0 pb-4 @3xl:py-8 @5xl:py-10 @7xl:py-14">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={panel}
                initial={lowPerformanceMode ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={lowPerformanceMode ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: lowPerformanceMode ? 0.1 : 0.2 }}
                className="flex-1 min-h-0 flex flex-col"
              >
                {panel === 'lyrics' && (
                  <>
                    <div className="mb-2 @3xl:mb-4">
                      <h2 className="text-[10px] @5xl:text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/40">
                        {t('lyrics')}
                      </h2>
                    </div>
                    <LyricsBody
                      synced={synced}
                      plain={plain}
                      activeLine={activeLine}
                      isLoading={lyricsLoading}
                      onLineClick={handleLineClick}
                      loadingLabel={t('findingLyrics')}
                      emptyLabel={t('noLyrics')}
                      syncedDimOpacity={lyricsSyncedDimOpacity}
                      plainOpacity={lyricsPlainOpacity}
                      syncedWrapperClassName="contents"
                      syncedContainerClassName="pr-2 @3xl:pr-4"
                      syncedSpacingClassName="space-y-4 @5xl:space-y-5 @7xl:space-y-6"
                      syncedBottomSpacerClassName="h-[40vh]"
                      syncedBaseClassName={npBase}
                      syncedActiveClassName={npActive}
                      syncedPastClassName={NP_PAST}
                      syncedIdleClassName={NP_IDLE}
                      plainContainerClassName="pr-2 @3xl:pr-4"
                      plainTextClassName={cn(
                        'text-foreground whitespace-pre-wrap font-sans font-medium tracking-[0.005em] leading-relaxed',
                        NP_PLAIN_SIZE_CLASS[lyricsPlainFontSize]
                      )}
                      emptyClassName="text-muted-foreground/25"
                    />
                  </>
                )}

                {panel === 'queue' && (
                  <div className="glass-subtle flex-1 min-h-0 rounded-2xl border border-border/20 overflow-hidden">
                    <QueuePanel />
                  </div>
                )}

                {panel === 'eq' && (
                  <div className="glass-subtle flex-1 min-h-0 overflow-y-auto overflow-x-auto scrollbar-thin rounded-2xl border border-border/20 p-4 @5xl:p-5">
                    <EqualizerPanel inline />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

export default NowPlayingView;
