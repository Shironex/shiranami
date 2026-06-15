import { Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useListeningClock } from './ListeningClock.hooks';
import type { IListeningClockProps } from './ListeningClock.types';

/** Last-7-days listening heatmap (7 weekday rows × 24 hours). */
export default function ListeningClock(props: IListeningClockProps) {
  const {
    title,
    rangeLabel,
    hasData,
    emptyCopy,
    gridAriaLabel,
    hourTicks,
    rows,
    legendSwatches,
    legendQuiet,
    legendLoud,
    peakLabel,
  } = useListeningClock(props);

  // Build the grid + legend above the return so JSX stays declarative.
  const tickNodes = hourTicks.map(tick => <span key={tick}>{tick}</span>);

  const rowNodes = rows.map(row => {
    const cellNodes = row.cells.map(cell => (
      <span
        key={cell.hour}
        className={cn(
          'h-3.5 flex-1 rounded-[3px]',
          cell.levelClass,
          cell.emphasized && 'ring-1 ring-inset ring-primary/40'
        )}
        title={cell.title}
      />
    ));
    return (
      <div key={row.key} className="flex items-center gap-1">
        <span className="w-8 shrink-0 font-mono text-[9px] uppercase text-muted-foreground/50">
          {row.dayLabel}
        </span>
        <div className="flex flex-1 gap-[3px]">{cellNodes}</div>
      </div>
    );
  });

  const legendNodes = legendSwatches.map(swatch => (
    <span
      key={swatch.level}
      aria-hidden="true"
      className={cn('size-3 rounded-[3px]', swatch.levelClass)}
    />
  ));

  return (
    <section className="flex flex-col rounded-[24px] border border-border/25 glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-primary/80" />
          <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
          {rangeLabel}
        </span>
      </div>

      {!hasData ? (
        <p className="mt-6 rounded-2xl border border-border/20 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground/60">
          {emptyCopy}
        </p>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto scrollbar-thin pb-1">
            <div className="min-w-[20rem]">
              <div className="ml-9 flex justify-between font-mono text-[9px] text-muted-foreground/45">
                {tickNodes}
              </div>

              <div className="mt-1.5 flex flex-col gap-1" role="img" aria-label={gridAriaLabel}>
                {rowNodes}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/55">
            <span className="font-mono uppercase tracking-wider">{legendQuiet}</span>
            {legendNodes}
            <span className="font-mono uppercase tracking-wider">{legendLoud}</span>
            <span className="ml-auto truncate text-muted-foreground/65">{peakLabel}</span>
          </div>
        </>
      )}
    </section>
  );
}
