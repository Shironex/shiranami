import type { IOverviewViewSkeletonView } from './OverviewViewSkeleton.types';

/**
 * The skeleton takes no props; the hook owns the placeholder-key arrays so the
 * shell stays a logic-free frame whose block counts mirror the loaded Overview
 * (four stat tiles, four library rows, four discover rows).
 */
const STAT_TILE_COUNT = 4;
const RECOMMENDATION_ROW_COUNT = 4;

function placeholderKeys(count: number): readonly number[] {
  return Array.from({ length: count }, (_, index) => index);
}

const STAT_TILE_KEYS = placeholderKeys(STAT_TILE_COUNT);
const LIBRARY_ROW_KEYS = placeholderKeys(RECOMMENDATION_ROW_COUNT);
const DISCOVER_ROW_KEYS = placeholderKeys(RECOMMENDATION_ROW_COUNT);

export function useOverviewViewSkeleton(): IOverviewViewSkeletonView {
  return {
    statTileKeys: STAT_TILE_KEYS,
    libraryRowKeys: LIBRARY_ROW_KEYS,
    discoverRowKeys: DISCOVER_ROW_KEYS,
  };
}
