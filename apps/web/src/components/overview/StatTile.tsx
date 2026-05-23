import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatTrendDirection = 'up' | 'down' | 'neutral';

interface StatTileProps {
  /** Faint kanji watermark in the corner (decorative). */
  kanji: string;
  /** The headline value — number, time, or artist name. */
  value: ReactNode;
  /** Lowercase descriptor under the value ("Listened this week"). */
  label: string;
  /** Sub-line: trend delta or context ("+2h 18m vs. last week"). */
  hint?: ReactNode;
  /** Tints the hint: `up` positive (green), others muted. */
  trend?: StatTrendDirection;
}

/**
 * One Overview stat tile. The kanji watermark is `aria-hidden` (decorative),
 * the value is the only emphasized content. Labels use `min-w-0`/truncate +
 * a reserved two-line height so the longer PL strings ("Najczęstszy artysta w
 * tym tygodniu") wrap gracefully instead of overflowing the 4-up grid.
 */
export function StatTile({ kanji, value, label, hint, trend = 'neutral' }: StatTileProps) {
  return (
    <div className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/25 glass-subtle p-4">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1 select-none font-display text-4xl leading-none text-primary/[0.09]"
      >
        {kanji}
      </span>

      <p className="min-w-0 truncate font-serif text-2xl font-medium text-foreground tabular-nums">
        {value}
      </p>

      <p className="mt-2 line-clamp-2 min-h-[2rem] text-[11px] font-medium uppercase leading-tight tracking-[0.16em] text-muted-foreground/65">
        {label}
      </p>

      {hint !== undefined && hint !== null && (
        <p
          className={cn(
            'mt-1.5 truncate text-xs',
            trend === 'up'
              ? 'text-emerald-400/90'
              : trend === 'down'
                ? 'text-muted-foreground/70'
                : 'text-muted-foreground/55'
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
