import { beforeEach, describe, expect, it } from 'vitest';
import { useRecapStore } from './useRecapStore';

describe('useRecapStore', () => {
  beforeEach(() => {
    useRecapStore.setState({ shownWeekKey: null, firstShownAt: null });
  });

  it('stamps a newly revealed week with the current moment', () => {
    const before = Date.now();
    useRecapStore.getState().noteShown('2026-07-27');

    const s = useRecapStore.getState();
    expect(s.shownWeekKey).toBe('2026-07-27');
    expect(s.firstShownAt).toBeGreaterThanOrEqual(before);
  });

  it('is idempotent for the same week — the linger window never restarts', () => {
    useRecapStore.getState().noteShown('2026-07-27');
    const stamped = useRecapStore.getState().firstShownAt;

    useRecapStore.getState().noteShown('2026-07-27');
    expect(useRecapStore.getState().firstShownAt).toBe(stamped);
  });

  it('a new week replaces the previous reveal', () => {
    useRecapStore.getState().noteShown('2026-07-20');
    useRecapStore.getState().noteShown('2026-07-27');

    expect(useRecapStore.getState().shownWeekKey).toBe('2026-07-27');
  });

  it('re-stamps a week persisted without its timestamp instead of wedging', () => {
    useRecapStore.setState({ shownWeekKey: '2026-07-27', firstShownAt: null });

    useRecapStore.getState().noteShown('2026-07-27');
    expect(useRecapStore.getState().firstShownAt).not.toBeNull();
  });
});
