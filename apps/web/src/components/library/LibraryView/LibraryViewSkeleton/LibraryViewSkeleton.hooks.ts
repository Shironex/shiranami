import type { ILibraryViewSkeletonView } from './LibraryViewSkeleton.types';

/** Roughly one screenful of the 52px library rows. */
const PLACEHOLDER_ROW_COUNT = 14;

// The list is fixed, so the keys are built once at module scope rather than on
// every render.
const ROW_KEYS: readonly string[] = Array.from(
  { length: PLACEHOLDER_ROW_COUNT },
  (_, index) => `library-skeleton-row-${index}`
);

/**
 * Owns the placeholder row list so the shell only maps ready-made keys into
 * markup and stays a thin, logic-free render.
 */
export function useLibraryViewSkeleton(): ILibraryViewSkeletonView {
  return { rowKeys: ROW_KEYS };
}
