import i18n from '@/lib/i18n';

/** Coarse time-of-day buckets that drive the greeting + mood glyph. */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/** Kanji glyph shown in the clock card when weather is off (decorative). */
export const TIME_OF_DAY_GLYPH: Record<TimeOfDay, string> = {
  morning: '朝',
  afternoon: '昼',
  evening: '夕',
  night: '夜',
};

/** Map a local hour (0–23) to a time-of-day bucket. */
export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** Greeting headline ("Good evening.") keyed off the current local hour. */
export function getGreeting(date: Date = new Date()): string {
  return i18n.t(`greeting.${getTimeOfDay(date.getHours())}`, { ns: 'overview' });
}

/** Secondary mood line under the greeting ("It's quiet out there."). */
export function getGreetingSubline(date: Date = new Date()): string {
  return i18n.t(`greetingSub.${getTimeOfDay(date.getHours())}`, { ns: 'overview' });
}

/**
 * ISO-8601 week number (weeks start Monday; week 1 contains the year's first
 * Thursday). Hand-rolled date math here is error-prone, so this follows the
 * canonical algorithm rather than approximating with `dayOfYear / 7`.
 */
export function getISOWeek(date: Date = new Date()): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Thursday in the current week decides the year.
  const dayNumber = (target.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / weekMs);
}

/** Locale-aware "SAT · 23 MAY · WK 21"-style date line for the clock card. */
export function formatClockDate(date: Date, locale: string): string {
  const weekday = date.toLocaleDateString(locale, { weekday: 'short' }).toUpperCase();
  const day = date.toLocaleDateString(locale, { day: 'numeric' });
  const month = date.toLocaleDateString(locale, { month: 'short' }).toUpperCase();
  const week = i18n.t('clock.week', { ns: 'overview', week: getISOWeek(date) });
  return `${weekday} · ${day} ${month} · ${week}`;
}

/**
 * Localized relative time for "Recently added" subtitles ("4 hrs ago",
 * "Yesterday", "2 days ago"). Uses `Intl.RelativeTimeFormat` so PL/EN both read
 * naturally without hand-maintained plural strings.
 */
export function formatRelativeTime(iso: string | undefined, locale: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const diffMs = then - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const minutes = Math.round(diffMs / 60000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);

  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  return rtf.format(Math.round(days / 30), 'month');
}

/**
 * Format a minute total as "14h 32m" / "32m". Returns the parts so the
 * renderer can style the units (`h`/`m`) smaller, mirroring the mockup's
 * `<span>` unit treatment.
 */
export function formatHoursMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.round(totalMinutes));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

/**
 * Signed delta label for the week-over-week trend ("+2h 18m", "-45m"). Returns
 * `null` when the delta rounds to zero so the trend line can be hidden.
 */
export function formatTrendDelta(deltaMinutes: number): { sign: 1 | -1; label: string } | null {
  const rounded = Math.round(deltaMinutes);
  if (rounded === 0) return null;
  const sign = rounded > 0 ? 1 : -1;
  const abs = Math.abs(rounded);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const magnitude = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return { sign, label: `${sign > 0 ? '+' : '−'}${magnitude}` };
}
