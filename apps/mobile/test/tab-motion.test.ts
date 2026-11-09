import { TAB_SHIFT, tabEntryShift } from '@/lib/tab-motion';

describe('tab entry', () => {
  it('drifts in from the side the tab is on', () => {
    expect(tabEntryShift(0, 3)).toBe(TAB_SHIFT);
    expect(tabEntryShift(3, 0)).toBe(-TAB_SHIFT);
  });

  it('does not move the first screen at launch or the same tab again', () => {
    expect(tabEntryShift(null, 0)).toBeNull();
    expect(tabEntryShift(2, 2)).toBeNull();
  });

  it('does not move a tab it cannot find', () => {
    expect(tabEntryShift(1, -1)).toBeNull();
  });
});
