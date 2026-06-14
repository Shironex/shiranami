import { cn } from '@/lib/utils';
import { useStatTile } from './StatTile.hooks';
import type { IStatTileProps } from './StatTile.types';

/**
 * One Overview stat tile. The kanji watermark is `aria-hidden` (decorative),
 * the value is the only emphasized content. Labels use `min-w-0`/truncate +
 * a reserved two-line height so the longer PL strings ("Najczęstszy artysta w
 * tym tygodniu") wrap gracefully instead of overflowing the 4-up grid.
 */
export default function StatTile(props: IStatTileProps) {
  const { kanji, value, label, hint } = props;
  const { showHint, hintClass } = useStatTile(props);

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

      {showHint && <p className={cn('mt-1.5 truncate text-xs', hintClass)}>{hint}</p>}
    </div>
  );
}
