export type DateGroup = 'today' | 'week' | 'earlier';

/** Local midnight `daysBack` days before `date`; calendar math, so DST days count as one. */
function startOfDay(date: Date, daysBack = 0): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBack).getTime();
}

/**
 * Which group a date falls in, by the local calendar: today, the six days
 * before it, or earlier. A date in the future (clock skew) counts as today.
 */
export function dateGroupOf(date: Date | null, now: Date): DateGroup {
  if (!date || Number.isNaN(date.getTime())) return 'earlier';
  const time = date.getTime();
  if (time >= startOfDay(now)) return 'today';
  if (time >= startOfDay(now, 6)) return 'week';
  return 'earlier';
}

export interface Grouped<T> {
  group: DateGroup;
  items: T[];
}

const ORDER: DateGroup[] = ['today', 'week', 'earlier'];

/** Splits items into date groups, keeping their order inside each group and skipping empty ones. */
export function groupByDate<T>(
  items: readonly T[],
  dateOf: (item: T) => Date | null,
  now: Date
): Grouped<T>[] {
  const buckets: Record<DateGroup, T[]> = { today: [], week: [], earlier: [] };
  for (const item of items) buckets[dateGroupOf(dateOf(item), now)].push(item);
  return ORDER.filter(group => buckets[group].length > 0).map(group => ({
    group,
    items: buckets[group],
  }));
}

/** SQLite `datetime('now')` text ("2026-11-08 21:04:00", UTC) as a Date. */
export function parseSqlTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
