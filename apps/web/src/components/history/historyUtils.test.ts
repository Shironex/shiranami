import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildActivitySeries,
  formatActivityLabel,
  formatListenTime,
  formatPlayedAt,
  formatTotalTime,
  getRangeCopy,
  getSinceForRange,
} from './historyUtils';
import type { ListeningActivityPoint } from '@/types/electron';

describe('getSinceForRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-21T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for all time', () => {
    expect(getSinceForRange('all')).toBeNull();
  });

  it('returns ISO start-of-day for 7d and 30d', () => {
    const seven = getSinceForRange('7d');
    expect(seven).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const thirty = getSinceForRange('30d');
    expect(thirty).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(seven).not.toBe(thirty);
  });
});

describe('getRangeCopy', () => {
  it('returns human labels', () => {
    expect(getRangeCopy('7d')).toBe('Last 7 days');
    expect(getRangeCopy('30d')).toBe('Last 30 days');
    expect(getRangeCopy('all')).toBe('All time');
  });
});

describe('buildActivitySeries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-21T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns activity as-is for all time', () => {
    const activity: ListeningActivityPoint[] = [
      { date: '2025-03-20', playCount: 2, listenedMinutes: 5 },
    ];
    expect(buildActivitySeries('all', activity)).toEqual(activity);
  });

  it('fills missing days for 7d range', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(today);
    const targetDate = target.toISOString().slice(0, 10);
    const activity: ListeningActivityPoint[] = [
      { date: targetDate, playCount: 1, listenedMinutes: 2 },
    ];
    const series = buildActivitySeries('7d', activity);
    expect(series).toHaveLength(7);
    const withPlays = series.filter(p => p.playCount > 0);
    expect(withPlays).toHaveLength(1);
    expect(withPlays[0]!.playCount).toBe(1);
  });
});

describe('formatTotalTime', () => {
  it('uses hours when >= 60 minutes', () => {
    expect(formatTotalTime(120)).toMatch(/h$/);
    expect(formatTotalTime(45)).toBe('45m');
  });
});

describe('formatListenTime', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatListenTime(30)).toContain('s listened');
    expect(formatListenTime(90)).toContain('m listened');
    expect(formatListenTime(7200)).toContain('h listened');
  });
});

describe('formatPlayedAt / formatActivityLabel', () => {
  it('uses locale string output', () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('Mar 21, 3:00 PM');
    expect(formatPlayedAt('2025-03-21T15:00:00.000Z')).toBe('Mar 21, 3:00 PM');
    spy.mockRestore();

    const spy2 = vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('Mar 21');
    expect(formatActivityLabel('2025-03-21')).toBe('Mar 21');
    spy2.mockRestore();
  });
});
