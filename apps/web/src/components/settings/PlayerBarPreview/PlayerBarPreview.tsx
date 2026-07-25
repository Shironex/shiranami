import { Heart, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { usePlayerBarPreview } from './PlayerBarPreview.hooks';
import type { IPlayerBarElementProps, IPlayerBarPreviewProps } from './PlayerBarPreview.types';

/** Horizontally-collapsible mock element of the player-bar preview. */
function PlayerBarElement({
  visible,
  highlighted,
  expandedClass,
  children,
  className,
}: IPlayerBarElementProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center overflow-hidden rounded-md transition-all duration-300',
        visible ? cn(expandedClass, 'opacity-100') : 'max-w-0 opacity-0',
        highlighted && visible && 'ring-1 ring-primary/40 bg-primary/10',
        className
      )}
    >
      {children}
    </div>
  );
}

export default function PlayerBarPreview(props: IPlayerBarPreviewProps) {
  const {
    title,
    albumArt,
    favorite,
    timeLabels,
    volume,
    utilityElements,
    showWaveformSeekbar,
    waveformHighlighted,
    waveBars,
  } = usePlayerBarPreview(props);

  const waveBarEls = waveBars.map((bar, i) => (
    <div
      key={i}
      className={cn('flex-1 rounded-full', bar.played ? 'bg-primary/60' : 'bg-muted-foreground/35')}
      style={{ height: `${bar.height}%` }}
    />
  ));

  const utilityButtons = utilityElements.map(({ key, Icon, visible, highlighted }) => (
    <PlayerBarElement
      key={key}
      visible={visible}
      highlighted={highlighted}
      expandedClass="max-w-6"
      className="p-1"
    >
      <Icon className="size-3 text-muted-foreground/70" />
    </PlayerBarElement>
  ));

  return (
    <SettingsPreview title={title}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={title}
      >
        {/* Full width on purpose (unlike the capped sibling mocks): the bar
            packs ~330px of fixed-width elements, so any tighter cap starves
            the flex-1 seek section into a centered clump. */}
        <div className="flex h-14 w-full items-center gap-2 rounded-xl border border-border/25 bg-surface/60 px-3">
          {/* Left: album art + title + favorite */}
          <PlayerBarElement
            visible={albumArt.visible}
            highlighted={albumArt.highlighted}
            expandedClass="max-w-10"
          >
            <div className="size-8 rounded-md bg-primary/20" />
          </PlayerBarElement>
          <div className="min-w-0 space-y-1">
            <div className="h-1.5 w-16 rounded-full bg-foreground/25" />
            <div className="h-1 w-11 rounded-full bg-muted-foreground/25" />
          </div>
          <PlayerBarElement
            visible={favorite.visible}
            highlighted={favorite.highlighted}
            expandedClass="max-w-6"
            className="p-1"
          >
            <Heart className="size-3 fill-favorite/70 text-favorite/70" />
          </PlayerBarElement>

          {/* Center: controls + seek (always shown) */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1">
            <div className="flex items-center gap-1.5">
              <SkipBack className="size-2.5 text-muted-foreground/60" />
              <div className="grid size-5 place-items-center rounded-full bg-primary/35">
                <Play className="size-2 fill-foreground/80 text-foreground/80" />
              </div>
              <SkipForward className="size-2.5 text-muted-foreground/60" />
            </div>
            <div className="flex w-full items-center gap-1.5">
              <PlayerBarElement
                visible={timeLabels.visible}
                highlighted={timeLabels.highlighted}
                expandedClass="max-w-8"
                className="px-0.5"
              >
                <span className="text-[8px] tabular-nums text-muted-foreground/70">1:24</span>
              </PlayerBarElement>
              {showWaveformSeekbar ? (
                <div
                  className={cn(
                    'flex h-4 min-w-0 flex-1 items-center gap-px rounded-md px-0.5 transition-all duration-300',
                    waveformHighlighted && 'bg-primary/10 ring-1 ring-primary/40'
                  )}
                >
                  {waveBarEls}
                </div>
              ) : (
                <div
                  className={cn(
                    'h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/35 transition-all duration-300',
                    waveformHighlighted && 'ring-1 ring-primary/40'
                  )}
                >
                  <div className="h-full w-[38%] rounded-full bg-primary/55" />
                </div>
              )}
              <PlayerBarElement
                visible={timeLabels.visible}
                highlighted={timeLabels.highlighted}
                expandedClass="max-w-8"
                className="px-0.5"
              >
                <span className="text-[8px] tabular-nums text-muted-foreground/70">3:45</span>
              </PlayerBarElement>
            </div>
          </div>

          {/* Right: utility buttons + volume */}
          <div className="flex items-center gap-0.5">
            {utilityButtons}
            <PlayerBarElement
              visible={volume.visible}
              highlighted={volume.highlighted}
              expandedClass="max-w-14"
              className="gap-1 p-1"
            >
              <Volume2 className="size-3 shrink-0 text-muted-foreground/70" />
              <div className="h-1 w-7 shrink-0 overflow-hidden rounded-full bg-muted/35">
                <div className="h-full w-2/3 rounded-full bg-foreground/40" />
              </div>
            </PlayerBarElement>
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}
