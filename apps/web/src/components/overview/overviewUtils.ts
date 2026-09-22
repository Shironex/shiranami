import i18n from '@/lib/i18n';
import { pad2 } from '@shiranami/shared';
import { formatHoursMinutes, formatListeningDuration } from '@/lib/listeningDuration';
import type { WeatherCondition } from '@shiranami/contracts';
import type { ListeningHourlyActivityPoint } from '@/types/electron';

/** Kanji mood glyph per weather condition (the 雨-style glyph the mockup shows). */
export const WEATHER_GLYPH: Record<WeatherCondition, string> = {
  clear: '晴',
  partly_cloudy: '曇',
  cloudy: '曇',
  rain: '雨',
  snow: '雪',
  thunderstorm: '雷',
  fog: '霧',
  unknown: '天',
};

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

// Duration prose moved to `@/lib/listeningDuration` so the shared weekly-recap
// card can narrate durations without a cross-feature import; re-exported here
// for the overview widgets that always used them from this module.
export { formatHoursMinutes, formatListeningDuration };

/**
 * Signed delta label for the week-over-week trend ("+2h 18m", "-45m"). Returns
 * `null` when the delta rounds to zero so the trend line can be hidden.
 */
export function formatTrendDelta(deltaMinutes: number): { sign: 1 | -1; label: string } | null {
  const rounded = Math.round(deltaMinutes);
  if (rounded === 0) return null;
  const sign = rounded > 0 ? 1 : -1;
  const { hours, minutes } = formatHoursMinutes(Math.abs(rounded));
  const magnitude = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return { sign, label: `${sign > 0 ? '+' : '−'}${magnitude}` };
}

/** Intensity bucket for a heatmap cell: 0 (silent) … 4 (loud). */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapCell {
  /** Mon-first row index, 0=Mon … 6=Sun. */
  row: number;
  /** Hour of day, 0–23. */
  hour: number;
  playCount: number;
  level: HeatLevel;
}

export interface HeatmapModel {
  /** 7 rows (Mon→Sun) × 24 hours. */
  cells: HeatmapCell[][];
  /** True when there is at least one play in the window. */
  hasData: boolean;
  /** Peak hour (0–23), or null when no data. */
  peakHour: number | null;
  /** Total plays across the grid. */
  totalPlays: number;
}

/** SQLite day-of-week (0=Sun) → Mon-first row (0=Mon … 6=Sun). */
function sqliteDowToMonFirstRow(dow: number): number {
  return (dow + 6) % 7;
}

/**
 * Quantize a play count into one of 5 intensity levels using the non-zero
 * counts' quartiles. Quantile thresholds (rather than `count / max`) keep the
 * grid readable when one cell is a huge outlier — most cells would otherwise
 * collapse to level 0/1.
 */
function buildLevelThresholds(nonZeroCounts: number[]): number[] {
  if (nonZeroCounts.length === 0) return [];
  const sorted = [...nonZeroCounts].sort((a, b) => a - b);
  const quantile = (q: number) => {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo]!;
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
  };
  // Three cut points split the non-zero range into levels 1–4.
  return [quantile(0.25), quantile(0.5), quantile(0.75)];
}

function levelFor(count: number, thresholds: number[]): HeatLevel {
  if (count <= 0) return 0;
  if (thresholds.length < 3) return 2;
  if (count <= thresholds[0]!) return 1;
  if (count <= thresholds[1]!) return 2;
  if (count <= thresholds[2]!) return 3;
  return 4;
}

/**
 * Build the 7×24 listening-clock model from the IPC's hourly buckets. Remaps
 * SQLite's Sunday-indexed day-of-week to a Mon-first grid and quantizes counts
 * into 5 levels. Returns a fully-populated grid (zero-filled) so the renderer
 * never has to guard individual cells.
 */
export function buildHeatmap(points: ListeningHourlyActivityPoint[]): HeatmapModel {
  const counts: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let totalPlays = 0;

  for (const point of points) {
    if (!Number.isInteger(point.hour) || point.hour < 0 || point.hour > 23) continue;
    if (!Number.isInteger(point.dayOfWeek) || point.dayOfWeek < 0 || point.dayOfWeek > 6) continue;
    const row = sqliteDowToMonFirstRow(point.dayOfWeek);
    counts[row]![point.hour] += point.playCount;
    totalPlays += point.playCount;
  }

  const nonZero: number[] = [];
  for (const row of counts) for (const c of row) if (c > 0) nonZero.push(c);
  const thresholds = buildLevelThresholds(nonZero);

  const cells: HeatmapCell[][] = counts.map((row, rowIndex) =>
    row.map((playCount, hour) => ({
      row: rowIndex,
      hour,
      playCount,
      level: levelFor(playCount, thresholds),
    }))
  );

  // Peak hour = the hour-of-day column with the most plays summed across days.
  let peakHour: number | null = null;
  if (totalPlays > 0) {
    let best = -1;
    for (let hour = 0; hour < 24; hour += 1) {
      let sum = 0;
      for (let row = 0; row < 7; row += 1) sum += counts[row]![hour]!;
      if (sum > best) {
        best = sum;
        peakHour = hour;
      }
    }
  }

  return { cells, hasData: totalPlays > 0, peakHour, totalPlays };
}

/** Mon-first weekday short names for the active locale (heatmap row labels). */
export function getWeekdayShortNames(locale: string): string[] {
  // 2024-01-01 is a Monday — walk 7 days to get Mon→Sun in the locale.
  const base = new Date(Date.UTC(2024, 0, 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    return d.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
  });
}

/** "23:00 – 02:00"-style peak window label around a peak hour. */
export function formatPeakWindow(peakHour: number): string {
  const start = peakHour;
  const end = (peakHour + 3) % 24;
  return `${pad2(start)}:00 – ${pad2(end)}:00`;
}
