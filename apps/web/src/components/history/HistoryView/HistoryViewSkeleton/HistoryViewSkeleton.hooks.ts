import type { IHistoryViewSkeletonView } from './HistoryViewSkeleton.types';

/** Placeholder counts mirroring the loaded dashboard's own layout. */
const HERO_PILL_COUNT = 3;
const STAT_CARD_COUNT = 4;
const PANEL_ROW_COUNT = 4;
const LIST_PANEL_COUNT = 2;
const RECENT_ROW_COUNT = 6;

// Every list is fixed, so the keys are built once at module scope rather than on
// every render.
function skeletonKeys(name: string, count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `history-skeleton-${name}-${index}`);
}

const HERO_PILL_KEYS = skeletonKeys('hero-pill', HERO_PILL_COUNT);
const STAT_CARD_KEYS = skeletonKeys('stat-card', STAT_CARD_COUNT);
const PANEL_ROW_KEYS = skeletonKeys('panel-row', PANEL_ROW_COUNT);
const LIST_PANEL_KEYS = skeletonKeys('list-panel', LIST_PANEL_COUNT);
const RECENT_ROW_KEYS = skeletonKeys('recent-row', RECENT_ROW_COUNT);

/**
 * Owns every placeholder list so the shell only maps ready-made keys into
 * markup and stays a thin, logic-free render.
 */
export function useHistoryViewSkeleton(): IHistoryViewSkeletonView {
  return {
    heroPillKeys: HERO_PILL_KEYS,
    statCardKeys: STAT_CARD_KEYS,
    panelRowKeys: PANEL_ROW_KEYS,
    listPanelKeys: LIST_PANEL_KEYS,
    recentRowKeys: RECENT_ROW_KEYS,
  };
}
