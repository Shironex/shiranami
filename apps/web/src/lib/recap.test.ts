import { describe, expect, it } from 'vitest';
import {
  RECAP_REVEAL_DAYS,
  formatWeekRange,
  getLastCompletedWeek,
  isRecapFresh,
  listCompletedWeeks,
  localDateKey,
  startOfLocalWeek,
} from './recap';

// All fixtures are constructed with the LOCAL Date constructor on purpose:
// week boundaries are local wall time, so these tests assert the same facts
// in every timezone the suite runs in.

describe('startOfLocalWeek', () => {
  it('maps every day of a week to its Monday', () => {
    // 2026-08-03 is a Monday.
    const monday = new Date(2026, 7, 3, 0, 0, 0);
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(2026, 7, 3 + offset, 15, 30);
      const start = startOfLocalWeek(day);
      expect(start.getTime()).toBe(monday.getTime());
    }
  });

  it('lands exactly on local midnight', () => {
    const start = startOfLocalWeek(new Date(2026, 7, 5, 23, 59, 59));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
  });

  it('keeps Sunday in the week that started the previous Monday', () => {
    // 2026-08-09 is a Sunday; its week starts 2026-08-03.
    const start = startOfLocalWeek(new Date(2026, 7, 9, 1, 0));
    expect(localDateKey(start)).toBe('2026-08-03');
  });

  it('crosses month and year boundaries by wall clock', () => {
    // 2026-01-01 is a Thursday; its week starts Monday 2025-12-29.
    const start = startOfLocalWeek(new Date(2026, 0, 1, 9, 0));
    expect(localDateKey(start)).toBe('2025-12-29');
  });
});

describe('getLastCompletedWeek', () => {
  it('flips to the finished week the moment Monday begins', () => {
    // Sunday 2026-08-02 23:59 — the running week (starting Jul 27) is not
    // complete yet, so the last finished one starts Jul 20.
    const lateSunday = getLastCompletedWeek(new Date(2026, 7, 2, 23, 59));
    expect(lateSunday.key).toBe('2026-07-20');

    // Monday 2026-08-03 00:00 — Jul 27's week has just completed.
    const monday = getLastCompletedWeek(new Date(2026, 7, 3, 0, 0));
    expect(monday.key).toBe('2026-07-27');
    expect(localDateKey(monday.end)).toBe('2026-08-03');
  });

  it('spans exactly seven local days with an exclusive end', () => {
    const week = getLastCompletedWeek(new Date(2026, 7, 5, 12, 0));
    expect(localDateKey(week.start)).toBe('2026-07-27');
    expect(localDateKey(week.end)).toBe('2026-08-03');
    expect(week.end.getHours()).toBe(0);
    // Wall-clock span: 7 days, give or take a DST hour if one sits inside.
    const spanHours = (week.end.getTime() - week.start.getTime()) / 3_600_000;
    expect(spanHours).toBeGreaterThanOrEqual(7 * 24 - 1);
    expect(spanHours).toBeLessThanOrEqual(7 * 24 + 1);
  });

  it('stays on local midnight across a DST transition inside the week', () => {
    // Late March holds the EU spring-forward Sunday (2026-03-29) and the US
    // one falls earlier in the month; in any timezone the invariant is the
    // same — both bounds sit on local midnight, whatever UTC instant that is.
    const week = getLastCompletedWeek(new Date(2026, 3, 1, 12, 0));
    expect(week.start.getHours()).toBe(0);
    expect(week.end.getHours()).toBe(0);
    expect(localDateKey(week.start)).toBe('2026-03-23');
    expect(localDateKey(week.end)).toBe('2026-03-30');
  });
});

describe('listCompletedWeeks', () => {
  it('walks backwards week by week, newest first, with stable keys', () => {
    const weeks = listCompletedWeeks(new Date(2026, 7, 5, 12, 0), 4);
    expect(weeks.map(week => week.key)).toEqual([
      '2026-07-27',
      '2026-07-20',
      '2026-07-13',
      '2026-07-06',
    ]);
  });

  it('adjacent windows share their boundary instant (exclusive end = next start)', () => {
    const [newer, older] = listCompletedWeeks(new Date(2026, 7, 5), 2);
    expect(older.end.getTime()).toBe(newer.start.getTime());
  });
});

describe('isRecapFresh', () => {
  it('is fresh strictly inside the reveal window and stale after it', () => {
    const shown = new Date(2026, 7, 3, 9, 0).getTime();
    const revealMs = RECAP_REVEAL_DAYS * 24 * 3_600_000;
    expect(isRecapFresh(shown, shown)).toBe(true);
    expect(isRecapFresh(shown, shown + revealMs - 1)).toBe(true);
    expect(isRecapFresh(shown, shown + revealMs)).toBe(false);
  });

  it('treats a clock that jumped backwards as stale rather than eternal', () => {
    const shown = new Date(2026, 7, 3, 9, 0).getTime();
    expect(isRecapFresh(shown, shown - 1)).toBe(false);
  });
});

describe('formatWeekRange', () => {
  it('labels the window with its inclusive last day', () => {
    const week = getLastCompletedWeek(new Date(2026, 7, 5));
    // Jul 27 – Aug 2 in en; assert the day numbers rather than locale month names.
    const label = formatWeekRange(week, 'en');
    expect(label).toContain('27');
    expect(label).toContain('2');
    expect(label).toContain('–');
  });
});
