import { reconcileOrder } from './sidebar-items';
import type { InterfaceElementKey } from '@/stores/useInterfaceStore';

/** Interface-store toggle keys that gate individual Overview widgets. */
export type OverviewWidgetKey = Extract<InterfaceElementKey, `overview${string}`>;

/**
 * A reorderable slice of the Overview page. Most sections wrap a single
 * widget; `insights` is the composed week grid (top-this-week beside the
 * clock/albums column), which moves as one block because its widgets share a
 * layout row rather than stacking.
 */
export type OverviewSectionId =
  | 'recap'
  | 'memories'
  | 'stats'
  | 'insights'
  | 'mixes'
  | 'recommendations'
  | 'recentlyAdded';

export interface OverviewSection {
  id: OverviewSectionId;
  /** i18n key resolved in settings' `app.interface.elements` namespace. */
  labelKey: string;
  /** The interface-store toggles for the widgets inside this section. */
  toggles: OverviewWidgetKey[];
}

/**
 * Every Overview section in default display order. Single source of truth for
 * the live Overview page, the settings reorder/toggle list, and the settings
 * preview — the mirror of `SIDEBAR_NAV_ITEMS` for the dashboard.
 */
export const OVERVIEW_SECTIONS: OverviewSection[] = [
  { id: 'recap', labelKey: 'overviewRecap', toggles: ['overviewRecap'] },
  { id: 'memories', labelKey: 'overviewMemories', toggles: ['overviewMemories'] },
  { id: 'stats', labelKey: 'overviewStats', toggles: ['overviewStats'] },
  {
    id: 'insights',
    labelKey: 'overviewInsights',
    toggles: ['overviewTopWeek', 'overviewClock', 'overviewTopAlbums'],
  },
  { id: 'mixes', labelKey: 'overviewMixes', toggles: ['overviewMixes'] },
  {
    id: 'recommendations',
    labelKey: 'overviewRecommendations',
    toggles: ['overviewRecommendations'],
  },
  { id: 'recentlyAdded', labelKey: 'overviewRecentlyAdded', toggles: ['overviewRecentlyAdded'] },
];

/** Quick lookup of a section by its id. */
export const OVERVIEW_SECTION_BY_ID = new Map(
  OVERVIEW_SECTIONS.map(section => [section.id, section])
);

/** Default section display order — the static order of {@link OVERVIEW_SECTIONS}. */
export const DEFAULT_OVERVIEW_ORDER: OverviewSectionId[] = OVERVIEW_SECTIONS.map(
  section => section.id
);

/**
 * Reconcile a (possibly stale) saved section order against the current
 * sections. See {@link reconcileOrder}; sections added in a future version
 * append at the end rather than disappearing, and ids dropped from the app
 * never linger.
 */
export function sanitizeOverviewOrder(saved: unknown): OverviewSectionId[] {
  return reconcileOrder(saved, DEFAULT_OVERVIEW_ORDER);
}
