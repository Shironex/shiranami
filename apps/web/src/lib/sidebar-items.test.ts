import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIDEBAR_ORDER,
  SIDEBAR_NAV_ITEMS,
  reconcileOrder,
  sanitizeSidebarOrder,
} from './sidebar-items';

describe('reconcileOrder', () => {
  const DEFAULT = ['a', 'b', 'c', 'd'] as const;

  it('returns the default order verbatim for non-array input', () => {
    expect(reconcileOrder(undefined, DEFAULT)).toEqual(['a', 'b', 'c', 'd']);
    expect(reconcileOrder(null, DEFAULT)).toEqual(['a', 'b', 'c', 'd']);
    expect(reconcileOrder('nope', DEFAULT)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the saved order and appends ids missing from it', () => {
    expect(reconcileOrder(['c', 'a'], DEFAULT)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('drops ids no longer in the default order', () => {
    expect(reconcileOrder(['b', 'zzz', 'a'], DEFAULT)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('dedupes repeated ids', () => {
    expect(reconcileOrder(['b', 'b', 'a', 'a'], DEFAULT)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('always yields every default id exactly once', () => {
    const result = reconcileOrder(['d', 'd', 'ghost'], DEFAULT);
    expect(new Set(result).size).toBe(DEFAULT.length);
    for (const id of DEFAULT) expect(result).toContain(id);
  });
});

describe('sanitizeSidebarOrder', () => {
  it('produces a complete sidebar order from a partial saved list', () => {
    const result = sanitizeSidebarOrder(['radio', 'library']);
    expect(result[0]).toBe('radio');
    expect(result[1]).toBe('library');
    expect(new Set(result).size).toBe(DEFAULT_SIDEBAR_ORDER.length);
    for (const item of SIDEBAR_NAV_ITEMS) expect(result).toContain(item.id);
  });

  it('returns the default order for garbage input', () => {
    expect(sanitizeSidebarOrder(42)).toEqual(DEFAULT_SIDEBAR_ORDER);
  });
});
