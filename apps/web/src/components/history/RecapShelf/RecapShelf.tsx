import { Feather } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WeeklyRecapCard } from '@/components/shared/WeeklyRecapCard';
import { useRecapShelf } from './RecapShelf.hooks';

/**
 * The recap archive: past weeks stack up here and any of them can be revisited
 * — reachable at any time, not only while a fresh card is on Overview, so the
 * Overview card is an appearance and never bait. Selecting a week re-derives
 * its recap from history (closed `since`/`until` window); a week with nothing
 * played says so plainly instead of showing a card of zeros.
 *
 * A plain shelf (heading + week chips), not a panel: the recap card below
 * brings its own panel, exactly as it appears on Overview.
 */
export default function RecapShelf() {
  const { title, caption, weeks, onSelectWeek, recap, selectedLabel, isLoading, quietWeekCopy } =
    useRecapShelf();

  const weekChips = weeks.map(week => (
    <button
      key={week.key}
      type="button"
      aria-pressed={week.selected}
      onClick={() => onSelectWeek(week.key)}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        week.selected
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border/25 text-muted-foreground hover:border-border/45 hover:text-foreground'
      )}
    >
      {week.label}
    </button>
  ));

  return (
    <section>
      <div className="flex items-center gap-2">
        <Feather className="size-4 text-primary/80" aria-hidden="true" />
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground/65">{caption}</p>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">{weekChips}</div>

      <div className="mt-3">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-[24px] border border-border/20 bg-background/20" />
        ) : recap ? (
          <WeeklyRecapCard recap={recap} weekLabel={selectedLabel} />
        ) : (
          <p className="rounded-[24px] border border-border/20 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground/60">
            {quietWeekCopy}
          </p>
        )}
      </div>
    </section>
  );
}
