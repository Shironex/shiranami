import { cn } from '@/lib/utils';
import { HISTORY_RANGES, getRangeCopy, type HistoryRange } from './historyUtils';

type HistoryHeroSectionProps = {
  selectedRange: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
};

export function HistoryHeroSection({ selectedRange, onRangeChange }: HistoryHeroSectionProps) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-border/25 bg-surface/35 p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.18),transparent_45%)]" />
      <div className="relative">
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground/55">
          Listening History
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground">
          A running picture of what you actually stick with.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground/75">
          Showing {getRangeCopy(selectedRange).toLowerCase()}. Stats are built from meaningful listens,
          not every accidental click.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {HISTORY_RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              onClick={() => onRangeChange(range.id)}
              className={cn(
                'rounded-full border px-4 py-2 text-xs font-medium transition-colors',
                selectedRange === range.id
                  ? 'border-primary/60 bg-primary/15 text-primary'
                  : 'border-border/20 bg-background/30 text-muted-foreground hover:border-border/35 hover:text-foreground',
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
