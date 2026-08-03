import { Feather } from 'lucide-react';
import { useWeeklyRecapCard } from './WeeklyRecapCard.hooks';
import type { IWeeklyRecapCardProps } from './WeeklyRecapCard.types';

/**
 * "This week, quietly" — the soft recap card. A handful of prose lines about
 * the week that just finished (hours across sittings, the most-returned track,
 * the loudest hour), written by the app on the listener's behalf. No badges,
 * no arrows, no comparisons — the StatStrip already owns the trend. Shown on
 * Overview for a few days after a week completes, and re-used verbatim by the
 * History archive for past weeks.
 */
export default function WeeklyRecapCard(props: IWeeklyRecapCardProps) {
  const { onOpenArchive } = props;
  const { title, titleEm, weekLabel, lines, archiveLabel } = useWeeklyRecapCard(props);

  const lineNodes = lines.map(line => (
    <p key={line} className="text-sm leading-relaxed text-muted-foreground">
      {line}
    </p>
  ));

  return (
    <section className="rounded-[24px] border border-border/25 glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Feather className="size-4 text-primary/80" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-foreground">
            {title} <em className="text-primary/85">{titleEm}</em>
          </h2>
        </div>
        {onOpenArchive && (
          <button
            type="button"
            onClick={onOpenArchive}
            className="rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {archiveLabel} →
          </button>
        )}
      </div>

      {weekLabel && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
          {weekLabel}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-1">{lineNodes}</div>
    </section>
  );
}
