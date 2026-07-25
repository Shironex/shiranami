import type { IMixesViewSkeletonView } from './MixesViewSkeleton.types';

/** Matches the number of curated mixes so the skeleton settles without a jump. */
const PLACEHOLDER_ROW_COUNT = 6;

// The list is fixed, so the keys are built once at module scope rather than on
// every render.
const ROW_KEYS: readonly string[] = Array.from(
  { length: PLACEHOLDER_ROW_COUNT },
  (_, index) => `mixes-skeleton-row-${index}`
);

/**
 * Owns the placeholder row list so the shell only maps ready-made keys into
 * markup and stays a thin, logic-free render.
 */
export function useMixesViewSkeleton(): IMixesViewSkeletonView {
  return { rowKeys: ROW_KEYS };
}
