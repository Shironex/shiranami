import { Music, Clock3, Disc3, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlayerControls } from '@/components/player/PlayerControls';
import { SeekBar } from '@/components/player/SeekBar';
import { WaveformSeekbar } from '@/components/player/WaveformSeekbar';
import { TimeDisplay } from '@/components/player/TimeDisplay';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import { useSanctuaryView } from './SanctuaryView.hooks';

/**
 * Sanctuary Mode: the fullscreen immersive player. The artwork bloom behind it
 * is the global `<AmbientBackground/>` (this view replaces the shell chrome,
 * not the z-0 layers). Chrome — the exit/variant buttons and the transport —
 * swims away after four still seconds and returns on any pointer or key
 * activity; the hairline waveform at the bottom edge stays. An auto-entered
 * (screensaver) sanctuary exits on any activity instead.
 */
export default function SanctuaryView() {
  const {
    hasTrack,
    currentTrack,
    variant,
    chromeVisible,
    activeLineText,
    showWaveformSeekbar,
    timeLabel,
    dateLabel,
    weatherLabel,
    exitLabel,
    variantToggleLabel,
    onExit,
    onToggleVariant,
  } = useSanctuaryView();

  if (!hasTrack || !currentTrack) return null;

  const VariantIcon = variant === 'cover' ? Clock3 : Disc3;

  const chromeClass = cn(
    'transition-opacity duration-500',
    !chromeVisible && 'opacity-0 pointer-events-none'
  );

  const trackLine = `${currentTrack.artist} · ${currentTrack.album}`;

  return (
    <div
      data-slot="sanctuary-view"
      className={cn(
        'relative flex-1 h-full min-h-0 flex flex-col overflow-hidden',
        !chromeVisible && 'cursor-none'
      )}
    >
      {/* Top chrome: variant toggle + exit */}
      <div className={cn('absolute top-0 inset-x-0 z-10 flex justify-end gap-1 p-4', chromeClass)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              onClick={onToggleVariant}
              className="glass-subtle text-muted-foreground/70 hover:text-foreground"
              aria-label={variantToggleLabel}
            >
              <VariantIcon />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="bottom">{variantToggleLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              onClick={onExit}
              className="glass-subtle text-muted-foreground/70 hover:text-foreground"
              aria-label={exitLabel}
            >
              <Minimize2 />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="bottom">{exitLabel}</TooltipContent>
        </Tooltip>
      </div>

      {/* Center stage */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 px-8">
        {variant === 'cover' ? (
          <>
            <div
              className={cn(
                'shrink-0 aspect-square rounded-3xl overflow-hidden',
                'shadow-2xl shadow-black/50 bg-muted flex items-center justify-center',
                'w-[min(48vh,44vw,34rem)]'
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
                <Music className="w-20 h-20 text-muted-foreground/30" />
              )}
            </div>

            <div className="text-center max-w-[70vw]">
              <h1 className="font-serif italic text-3xl @5xl:text-4xl text-foreground truncate">
                {currentTrack.title}
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5 truncate">{trackLine}</p>
            </div>

            {activeLineText && (
              <p
                aria-live="polite"
                className="font-serif italic text-xl text-foreground/75 text-center max-w-[60ch] text-balance"
              >
                {activeLineText}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="font-display text-[clamp(4rem,16vw,11rem)] leading-none tabular-nums tracking-tight text-foreground">
              {timeLabel}
            </div>
            <div className="text-base text-muted-foreground capitalize">
              {dateLabel}
              {weatherLabel && <span className="text-muted-foreground/70"> · {weatherLabel}</span>}
            </div>
            <p className="text-sm text-muted-foreground/60 max-w-[70vw] truncate">
              {currentTrack.title} — {trackLine}
            </p>
          </>
        )}
      </div>

      {/* Bottom edge: the hairline waveform stays; the transport fades. */}
      <div className="shrink-0 flex flex-col items-center gap-3 px-8 pb-6">
        <div className={cn('flex items-center gap-3', chromeClass)}>
          <PlayerControls />
          <div className="w-px h-5 bg-border/30" />
          <span className="text-[11px] text-muted-foreground/60 tabular-nums font-medium">
            <TimeDisplay />
          </span>
        </div>
        <div className="w-full max-w-3xl">
          {showWaveformSeekbar ? <WaveformSeekbar canvasClassName="h-6" /> : <SeekBar />}
        </div>
      </div>
    </div>
  );
}
