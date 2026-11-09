/** How far a tab's screen drifts in from the side it is on. */
export const TAB_SHIFT = 16;

/** Time past the end of the fade after which the screen is put in place by hand. */
export const TAB_SETTLE_GRACE_MS = 300;

/**
 * Where a tab's screen starts its entrance when it comes to the front: the
 * sideways offset (from the right when it sits right of the tab before, from
 * the left otherwise), or null for no entrance (the first screen at launch,
 * or the same tab again).
 */
export function tabEntryShift(previous: number | null, index: number): number | null {
  if (previous === null || index < 0 || previous === index) return null;
  return index > previous ? TAB_SHIFT : -TAB_SHIFT;
}
