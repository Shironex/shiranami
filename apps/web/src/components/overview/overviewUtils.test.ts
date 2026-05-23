import { describe, it, expect } from 'vitest';
import type { ListeningHourlyActivityPoint } from '@/types/electron';
import {
  buildHeatmap,
  formatPeakWindow,
  formatTrendDelta,
  getISOWeek,
  getTimeOfDay,
  WEATHER_GLYPH,
} from './overviewUtils';

describe('getTimeOfDay', () => {
  it.each([
    [6, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [21, 'evening'],
    [22, 'night'],
    [3, 'night'],
  ] as const)('hour %i → %s', (hour, expected) => {
    expect(getTimeOfDay(hour)).toBe(expected);
  });
});

describe('getISOWeek', () => {
  it('returns week 1 for early January in a year starting mid-week', () => {
    // 2025-01-02 is a Thursday → ISO week 1.
    expect(getISOWeek(new Date('2025-01-02T12:00:00'))).toBe(1);
  });

  it('handles the year-end boundary (week 1 of next year)', () => {
    // 2024-12-30 (Mon) falls in ISO week 1 of 2025.
    expect(getISOWeek(new Date('2024-12-30T12:00:00'))).toBe(1);
  });

  it('computes a mid-year week', () => {
    // 2025-05-23 is a Friday in ISO week 21.
    expect(getISOWeek(new Date('2025-05-23T12:00:00'))).toBe(21);
  });
});

describe('formatTrendDelta', () => {
  it('returns null for a zero delta', () => {
    expect(formatTrendDelta(0)).toBeNull();
  });

  it('formats a positive delta with hours + minutes', () => {
    const result = formatTrendDelta(138);
    expect(result).not.toBeNull();
    expect(result!.sign).toBe(1);
    expect(result!.label).toBe('+2h 18m');
  });

  it('formats a negative delta under an hour', () => {
    const result = formatTrendDelta(-45);
    expect(result!.sign).toBe(-1);
    expect(result!.label).toBe('−45m');
  });
});

describe('formatPeakWindow', () => {
  it('wraps a 3-hour window around the peak hour, rolling past midnight', () => {
    expect(formatPeakWindow(23)).toBe('23:00 – 02:00');
  });

  it('formats a daytime peak', () => {
    expect(formatPeakWindow(9)).toBe('09:00 – 12:00');
  });
});

describe('buildHeatmap', () => {
  it('returns an empty grid for no data', () => {
    const model = buildHeatmap([]);
    expect(model.hasData).toBe(false);
    expect(model.totalPlays).toBe(0);
    expect(model.peakHour).toBeNull();
    expect(model.cells).toHaveLength(7);
    expect(model.cells[0]).toHaveLength(24);
    expect(model.cells.flat().every(cell => cell.level === 0)).toBe(true);
  });

  it('remaps SQLite Sunday-indexed day-of-week to a Mon-first grid', () => {
    // dayOfWeek 0 = Sunday → should land on row 6 (Mon-first).
    const points: ListeningHourlyActivityPoint[] = [
      { dayOfWeek: 0, hour: 10, playCount: 3, listenedMinutes: 9 },
      // dayOfWeek 1 = Monday → row 0.
      { dayOfWeek: 1, hour: 10, playCount: 5, listenedMinutes: 15 },
    ];
    const model = buildHeatmap(points);
    expect(model.cells[6]![10]!.playCount).toBe(3); // Sunday row
    expect(model.cells[0]![10]!.playCount).toBe(5); // Monday row
    expect(model.hasData).toBe(true);
    expect(model.totalPlays).toBe(8);
  });

  it('detects the peak hour as the busiest hour column summed across days', () => {
    const points: ListeningHourlyActivityPoint[] = [
      { dayOfWeek: 1, hour: 23, playCount: 4, listenedMinutes: 12 },
      { dayOfWeek: 2, hour: 23, playCount: 6, listenedMinutes: 18 },
      { dayOfWeek: 3, hour: 9, playCount: 5, listenedMinutes: 15 },
    ];
    const model = buildHeatmap(points);
    expect(model.peakHour).toBe(23); // 4 + 6 = 10 > 5
  });

  it('quantizes counts into levels 1–4 across the non-zero range', () => {
    const points: ListeningHourlyActivityPoint[] = [
      { dayOfWeek: 1, hour: 0, playCount: 1, listenedMinutes: 1 },
      { dayOfWeek: 1, hour: 1, playCount: 2, listenedMinutes: 2 },
      { dayOfWeek: 1, hour: 2, playCount: 3, listenedMinutes: 3 },
      { dayOfWeek: 1, hour: 3, playCount: 10, listenedMinutes: 10 },
    ];
    const model = buildHeatmap(points);
    const levels = [0, 1, 2, 3].map(h => model.cells[0]![h]!.level);
    // Increasing counts must map to non-decreasing levels, topping out at 4.
    expect(levels[0]).toBeLessThanOrEqual(levels[1]!);
    expect(levels[1]).toBeLessThanOrEqual(levels[2]!);
    expect(levels[2]).toBeLessThanOrEqual(levels[3]!);
    expect(levels[3]).toBe(4);
    // Empty cells stay at level 0.
    expect(model.cells[0]![5]!.level).toBe(0);
  });

  it('ignores out-of-range hours and days defensively', () => {
    const points: ListeningHourlyActivityPoint[] = [
      { dayOfWeek: 1, hour: 25, playCount: 9, listenedMinutes: 9 },
      { dayOfWeek: 9, hour: 10, playCount: 9, listenedMinutes: 9 },
    ];
    const model = buildHeatmap(points);
    expect(model.totalPlays).toBe(0);
    expect(model.hasData).toBe(false);
  });
});

describe('WEATHER_GLYPH', () => {
  it('maps every condition to a kanji glyph', () => {
    expect(WEATHER_GLYPH.rain).toBe('雨');
    expect(WEATHER_GLYPH.snow).toBe('雪');
    expect(WEATHER_GLYPH.clear).toBe('晴');
    expect(WEATHER_GLYPH.thunderstorm).toBe('雷');
  });
});
