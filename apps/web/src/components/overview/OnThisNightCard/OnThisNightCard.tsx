import { MoonStar, Play } from 'lucide-react';
import { OverviewCover } from '@/components/overview/OverviewCover';
import { useOnThisNightCard } from './OnThisNightCard.hooks';
import type { IOnThisNightCardProps } from './OnThisNightCard.types';

/**
 * "A year ago, tonight" — the on-this-night memory card. One remembered track
 * from the anniversary window (a year back, or six months on quiet years),
 * spoken in the weekly recap's prose voice, with the cover itself as the play
 * affordance. The card only mounts when the window actually holds plays.
 */
export default function OnThisNightCard(props: IOnThisNightCardProps) {
  const { memory, onPlay } = props;
  const {
    title,
    titleEm,
    dateLabel,
    line,
    trackTitle,
    trackSubtitle,
    albumArt,
    coverSeed,
    playAria,
  } = useOnThisNightCard(props);

  return (
    <section className="rounded-[24px] border border-border/25 glass-panel p-4">
      <div className="flex items-center gap-2">
        <MoonStar className="size-4 text-primary/80" aria-hidden="true" />
        <h2 className="font-display text-lg font-semibold text-foreground">
          {title} <em className="text-primary/85">{titleEm}</em>
        </h2>
      </div>

      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
        {dateLabel}
      </p>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{line}</p>

      <button
        type="button"
        onClick={() => onPlay(memory.track.trackId)}
        aria-label={playAria}
        className="group mt-3 flex w-full items-center gap-3 rounded-2xl border border-border/15 bg-background/20 px-3 py-2.5 text-left transition-colors hover:border-border/35 hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative size-10 shrink-0">
          <OverviewCover
            albumArt={albumArt}
            title={trackTitle}
            seed={coverSeed}
            className="size-10"
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="size-4 fill-white text-white" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{trackTitle}</p>
          <p className="truncate text-xs text-muted-foreground">{trackSubtitle}</p>
        </div>
      </button>
    </section>
  );
}
