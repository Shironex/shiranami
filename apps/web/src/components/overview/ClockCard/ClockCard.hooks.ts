import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pad2 } from '@shiranami/shared';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatClockDate, getTimeOfDay, TIME_OF_DAY_GLYPH, type TimeOfDay } from '../overviewUtils';
import type { IClockCardProps, IClockCardView } from './ClockCard.types';

/**
 * Drives the live ticking clock card. Owns the 1s interval (aligned to the next
 * whole second) so only this subtree re-renders — never the 168-cell heatmap or
 * stat grid beside it. Computes the locale-aware time parts here so the shell
 * stays a pure render.
 */
export function useClockCard({ glyph }: IClockCardProps): IClockCardView {
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
  const minutePart = parts.find(p => p.type === 'minute')?.value ?? pad2(now.getMinutes());
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value;
  const fullTime = now.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

  const timeOfDay: TimeOfDay = getTimeOfDay(now.getHours());
  const resolvedGlyph = glyph ?? TIME_OF_DAY_GLYPH[timeOfDay];

  return {
    ariaLabel: t('clock.ariaLabel', { time: fullTime }),
    hourPart,
    minutePart,
    dayPeriod,
    dateLine: formatClockDate(now, locale),
    resolvedGlyph,
    moodLine: t(`mood.timeOfDay.${timeOfDay}`),
    reducedMotion,
  };
}
