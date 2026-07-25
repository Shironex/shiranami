import type { IPlaylistsViewSkeletonView } from './PlaylistsViewSkeleton.types';

/**
 * The skeleton takes no props; the hook supplies the placeholder-card keys so
 * the shell stays a logic-free frame. Ten cards fill the widest supported grid
 * (six columns) without leaving a visible gap on the second row.
 */
const PLACEHOLDER_COUNT = 10;

const PLACEHOLDER_KEYS: readonly number[] = Array.from(
  { length: PLACEHOLDER_COUNT },
  (_, index) => index
);

export function usePlaylistsViewSkeleton(): IPlaylistsViewSkeletonView {
  return {
    placeholderKeys: PLACEHOLDER_KEYS,
  };
}
