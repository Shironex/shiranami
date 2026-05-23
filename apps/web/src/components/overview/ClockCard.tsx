import { memo, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  formatClockDate,
  getTimeOfDay,
  TIME_OF_DAY_GLYPH,
  type TimeOfDay,
} from '@/components/overview/overviewUtils';

interface ClockCardProps {
  /**
   * Optional weather row injected by the parent (phase 6). When absent, the
   * card shows a time-of-day kanji glyph + a quiet mood line and makes ZERO
   * network calls.
   */
  weatherRow?: ReactNode;
  /** Mood glyph override (e.g. a weather glyph). Defaults to the time-of-day glyph. */
  glyph?: string;
}

/**
 * Live ticking clock card. Isolated as its own leaf (and memoized) so the 1s
 * interval re-renders only this subtree — never the 168-cell heatmap or stat
 * grid beside it. Mirrors the app's `MediaSessionSync` isolation pattern.
 *
 * The seconds are intentionally not rendered (and the whole time is
 * `aria-hidden`) with a stable `aria-label` on the container, so a screen
 * reader is not told the time every second.
 */
function ClockCardImpl({ weatherRow, glyph }: ClockCardProps) {
  const { t, i18n } = useTranslation('overview');
  const reducedMotion = useReducedMotion();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Align the first tick to the next whole second, then tick every second.
    let interval: ReturnType<typeof setInterval> | undefined;
    const alignMs = 1000 - (Date.now() % 1000);
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 1000);
    }, alignMs);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const locale = i18n.language;
  // Locale-aware hour (12h for en-US, 24h for pl, …) split into hour + minute
  // parts so the blinking colon sits between them. `formatToParts` keeps the
  // hour cycle correct without string-surgery on a formatted time.
  const parts = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const hourPart = parts.find(p => p.type === 'hour')?.value ?? String(now.getHours());
  const minutePart =
    parts.find(p => p.type === 'minute')?.value ?? String(now.getMinutes()).padStart(2, '0');
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value;
  const fullTime = now.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

  const timeOfDay: TimeOfDay = getTimeOfDay(now.getHours());
  const resolvedGlyph = glyph ?? TIME_OF_DAY_GLYPH[timeOfDay];

  return (
    <div
      className="relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-border/25 glass-subtle p-5"
      role="group"
      aria-label={t('clock.ariaLabel', { time: fullTime })}
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
        {formatClockDate(now, locale)}
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
            <p className="truncate text-sm font-medium text-foreground/85">
              {t(`mood.timeOfDay.${timeOfDay}`)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const ClockCard = memo(ClockCardImpl);
