import { Disc3, Play } from 'lucide-react';
import { OverviewCover } from '../OverviewCover';
import { useTopThisWeek } from './TopThisWeek.hooks';
import type { ITopThisWeekProps } from './TopThisWeek.types';

/** "Top this week" leaderboard of the most-played tracks. */
export default function TopThisWeek(props: ITopThisWeekProps) {
  const { onPlay, onOpenLibrary } = props;
  const { title, openLibraryLabel, hasTracks, emptyCopy, rows } = useTopThisWeek(props);

  // Build the rows above the return so JSX stays declarative.
  const rowNodes = rows.map(row => (
    <button
      key={row.trackId}
      type="button"
      onClick={() => onPlay(row.trackId)}
      aria-label={row.playAria}
      className="group flex w-full items-center gap-3 rounded-2xl border border-border/15 bg-background/20 px-3 py-2.5 text-left transition-colors hover:border-border/35 hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="w-6 shrink-0 text-center font-mono text-xs tabular-nums text-muted-foreground/55">
        {row.rankLabel}
      </span>

      <div className="relative size-10 shrink-0">
        <OverviewCover
          albumArt={row.albumArt}
          title={row.title}
          seed={row.coverSeed}
          className="size-10"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-4 fill-white text-white" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
        <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
      </div>

      <div className="flex w-24 shrink-0 items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/8">
          <span
            className="block h-full rounded-full bg-primary/70"
            style={{ width: `${row.width}%` }}
          />
        </span>
        <span className="w-6 text-right font-mono text-xs tabular-nums text-foreground/80">
          {row.playCount}
        </span>
      </div>
    </button>
  ));

  return (
    <section className="flex flex-col rounded-[24px] border border-border/25 glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Disc3 className="size-4 text-primary/80" />
          <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {openLibraryLabel} →
        </button>
      </div>

      {!hasTracks ? (
        <p className="mt-4 rounded-2xl border border-border/20 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground/60">
          {emptyCopy}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">{rowNodes}</div>
      )}
    </section>
  );
}
