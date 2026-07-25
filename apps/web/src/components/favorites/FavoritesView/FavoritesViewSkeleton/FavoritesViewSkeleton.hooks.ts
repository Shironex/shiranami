import type { IFavoritesViewSkeletonView } from './FavoritesViewSkeleton.types';

/** Roughly one screenful of the 52px favorites rows. */
const PLACEHOLDER_ROW_COUNT = 10;

// The list is fixed, so the keys are built once at module scope rather than on
// every render.
const ROW_KEYS: readonly string[] = Array.from(
  { length: PLACEHOLDER_ROW_COUNT },
  (_, index) => `favorites-skeleton-row-${index}`
);

/**
 * Owns the placeholder row list so the shell only maps ready-made keys into
 * markup and stays a thin, logic-free render.
 */
export function useFavoritesViewSkeleton(): IFavoritesViewSkeletonView {
  return { rowKeys: ROW_KEYS };
}
