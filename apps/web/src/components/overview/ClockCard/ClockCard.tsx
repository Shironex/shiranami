import { cn } from '@/lib/utils';
import { useClockCard } from './ClockCard.hooks';
import type { IClockCardProps } from './ClockCard.types';

/**
 * Live ticking clock card. Memoized at the barrel so the 1s interval re-renders
 * only this subtree. The seconds are intentionally not rendered (and the whole
 * time is `aria-hidden`) with a stable `aria-label` on the container, so a
 * screen reader is not told the time every second.
 */
export default function ClockCard(props: IClockCardProps) {
  const { weatherRow } = props;
  const {
    ariaLabel,
    hourPart,
    minutePart,
    dayPeriod,
    dateLine,
    resolvedGlyph,
    moodLine,
    reducedMotion,
  } = useClockCard(props);

  return (
    <div
      className="relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-border/25 glass-subtle p-5"
      role="group"
      aria-label={ariaLabel}
    >
      <div className="flex items-baseline font-serif text-5xl leading-none text-foreground tabular-nums sm:text-6xl">
        <span aria-hidden="true">{hourPart}</span>
        <span
          aria-hidden="true"
          className={cn('px-0.5 text-primary/70', !reducedMotion && 'overview-blink')}
        >
          :
        </span>
        <span aria-hidden="true">{minutePart}</span>
        {dayPeriod && (
          <span aria-hidden="true" className="ml-2 font-mono text-base text-muted-foreground/55">
            {dayPeriod}
          </span>
        )}
      </div>

      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/65">
        {dateLine}
      </div>

      <div className="flex items-center gap-3 border-t border-border/20 pt-3">
        <span
          aria-hidden="true"
          className="select-none font-display text-3xl leading-none text-primary/85"
        >
          {resolvedGlyph}
        </span>
        <div className="min-w-0">
          {weatherRow ?? (
            <p className="truncate text-sm font-medium text-foreground/85">{moodLine}</p>
          )}
        </div>
      </div>
    </div>
  );
}
