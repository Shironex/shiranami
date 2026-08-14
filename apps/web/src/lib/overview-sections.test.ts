import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERVIEW_ORDER,
  OVERVIEW_SECTIONS,
  sanitizeOverviewOrder,
} from './overview-sections';

describe('sanitizeOverviewOrder', () => {
  it('produces a complete section order from a partial saved list', () => {
    const result = sanitizeOverviewOrder(['mixes', 'recap']);
    expect(result[0]).toBe('mixes');
    expect(result[1]).toBe('recap');
    expect(new Set(result).size).toBe(DEFAULT_OVERVIEW_ORDER.length);
    for (const section of OVERVIEW_SECTIONS) expect(result).toContain(section.id);
  });

  it('appends sections added after the order was saved', () => {
    const legacy = DEFAULT_OVERVIEW_ORDER.filter(id => id !== 'recentlyAdded');
    const result = sanitizeOverviewOrder(legacy);
    expect(result).toEqual([...legacy, 'recentlyAdded']);
  });

  it('drops ids that no longer exist', () => {
    const result = sanitizeOverviewOrder(['stats', 'ghost', 'recap']);
    expect(result).not.toContain('ghost');
    expect(result.slice(0, 2)).toEqual(['stats', 'recap']);
  });

  it('returns the default order for garbage input', () => {
    expect(sanitizeOverviewOrder(42)).toEqual(DEFAULT_OVERVIEW_ORDER);
    expect(sanitizeOverviewOrder(undefined)).toEqual(DEFAULT_OVERVIEW_ORDER);
  });
});

describe('OVERVIEW_SECTIONS', () => {
  it('keeps section ids unique', () => {
    expect(new Set(DEFAULT_OVERVIEW_ORDER).size).toBe(OVERVIEW_SECTIONS.length);
  });

  it('assigns every widget toggle to exactly one section', () => {
    const toggles = OVERVIEW_SECTIONS.flatMap(section => section.toggles);
    expect(new Set(toggles).size).toBe(toggles.length);
  });
});
