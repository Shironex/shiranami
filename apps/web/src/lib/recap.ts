/**
 * Week-window logic for the "This week, quietly" recap.
 *
 * Weeks are LOCAL and Monday-first (matching the listening clock's Mon-first
 * grid and ISO-8601): a week runs from Monday 00:00 local wall time up to,
 * exclusively, the next Monday 00:00. All arithmetic is wall-clock
 * (`setDate`/`setHours` on local Dates), so a DST transition inside a week
 * shifts the window's UTC instants with the clocks instead of drifting the
 * boundary an hour off local midnight. The ISO strings handed to the history
 * reads come from `Date#toISOString()` at the very end, which is exactly the
 * format `play_history.played_at` compares against.
 */

export interface WeekWindow {
  /** Monday 00:00 local — inclusive lower bound. */
  readonly start: Date;
  /** The next Monday 00:00 local — exclusive upper bound. */
  readonly end: Date;
  /** Stable identity for the week: the start's local `YYYY-MM-DD`. */
  readonly key: string;
}

/** How long a fresh recap lingers on Overview after it is first seen. */
export const RECAP_REVEAL_DAYS = 3;

/** Fewer plays than this and the week gets no card — silence, not a reproach. */
export const RECAP_MIN_PLAYS = 3;

/** How many past weeks the archive shelf offers. */
export const RECAP_ARCHIVE_WEEKS = 12;

/** Local `YYYY-MM-DD` for a date (NOT `toISOString`, which would jump timezones). */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Monday 00:00 local wall time of the week containing `date`. */
export function startOfLocalWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  // getDay() is Sunday-indexed; remap so Monday is 0 … Sunday is 6.
  const monFirstDay = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - monFirstDay);
  return start;
}

function windowFromStart(start: Date): WeekWindow {
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end, key: localDateKey(start) };
}

/**
 * The most recently *completed* week as of `now` — the one whose exclusive
 * end is the current week's Monday 00:00. At Sunday 23:59 the running week is
 * still not it; one minute later it is.
 */
export function getLastCompletedWeek(now: Date = new Date()): WeekWindow {
  const currentWeekStart = startOfLocalWeek(now);
  const start = new Date(currentWeekStart);
  start.setDate(start.getDate() - 7);
  return windowFromStart(start);
}

/**
 * The last `count` completed weeks as of `now`, newest first — the archive's
 * derived shape (recaps are recomputed from history on demand, never stored).
 */
export function listCompletedWeeks(
  now: Date = new Date(),
  count: number = RECAP_ARCHIVE_WEEKS
): WeekWindow[] {
  const newest = getLastCompletedWeek(now);
  const weeks: WeekWindow[] = [newest];
  for (let index = 1; index < count; index += 1) {
    const start = new Date(weeks[index - 1].start);
    start.setDate(start.getDate() - 7);
    weeks.push(windowFromStart(start));
  }
  return weeks;
}

/** Whether a recap first revealed at `firstShownAt` (epoch ms) is still fresh. */
export function isRecapFresh(firstShownAt: number, now: number): boolean {
  const age = now - firstShownAt;
  return age >= 0 && age < RECAP_REVEAL_DAYS * 24 * 60 * 60 * 1000;
}

/** Locale-aware "26 Jul – 1 Aug" label for a week window (end shown inclusive). */
export function formatWeekRange(window: WeekWindow, locale: string): string {
  const lastDay = new Date(window.end);
  lastDay.setDate(lastDay.getDate() - 1);
  const fmt = (date: Date) => date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return `${fmt(window.start)} – ${fmt(lastDay)}`;
}
