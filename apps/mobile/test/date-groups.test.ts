import { dateGroupOf, groupByDate, parseSqlTime } from '@/lib/date-groups';

// Sunday 8 November 2026, 21:30 local time.
const now = new Date(2026, 10, 8, 21, 30);
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour);

describe('dateGroupOf', () => {
  it('puts anything since local midnight in today', () => {
    expect(dateGroupOf(at(8, 0), now)).toBe('today');
    expect(dateGroupOf(at(8, 21), now)).toBe('today');
  });

  it('puts the six days before today in this week', () => {
    expect(dateGroupOf(at(7, 23), now)).toBe('week');
    expect(dateGroupOf(at(2, 0), now)).toBe('week');
  });

  it('puts older dates in earlier', () => {
    expect(dateGroupOf(at(1, 23), now)).toBe('earlier');
    expect(dateGroupOf(new Date(2025, 0, 1), now)).toBe('earlier');
  });

  it('treats future dates as today and missing ones as earlier', () => {
    expect(dateGroupOf(at(9), now)).toBe('today');
    expect(dateGroupOf(null, now)).toBe('earlier');
    expect(dateGroupOf(new Date('nope'), now)).toBe('earlier');
  });
});

describe('groupByDate', () => {
  it('keeps order inside groups and drops empty groups', () => {
    const items = [
      { id: 'a', date: at(8, 9) },
      { id: 'b', date: at(1) },
      { id: 'c', date: at(8, 7) },
      { id: 'd', date: at(1, 1) },
    ];
    const groups = groupByDate(items, item => item.date, now);
    expect(groups.map(g => g.group)).toEqual(['today', 'earlier']);
    expect(groups[0].items.map(i => i.id)).toEqual(['a', 'c']);
    expect(groups[1].items.map(i => i.id)).toEqual(['b', 'd']);
  });
});

describe('parseSqlTime', () => {
  it('reads SQLite datetime text as UTC', () => {
    expect(parseSqlTime('2026-11-08 21:04:00')?.toISOString()).toBe('2026-11-08T21:04:00.000Z');
  });

  it('returns null for empty or broken values', () => {
    expect(parseSqlTime(null)).toBeNull();
    expect(parseSqlTime('')).toBeNull();
    expect(parseSqlTime('later')).toBeNull();
  });
});
