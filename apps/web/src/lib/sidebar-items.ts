import {
  Heart,
  History,
  LayoutDashboard,
  Library,
  ListMusic,
  ListPlus,
  DownloadCloud,
  Radio,
  Search,
  Settings,
  Sparkles,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import type { AppView } from '@/stores/useViewStore';

export interface SidebarNavItem {
  id: AppView;
  /** i18n key resolved in the `sidebar` namespace. */
  key: string;
  Icon: LucideIcon;
}

/**
 * Every sidebar navigation item in default display order. Single source of
 * truth for the live sidebar nav, the settings reorder/toggle list, and the
 * settings preview — keep this list and `AppView` in sync.
 */
export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'overview', key: 'overview', Icon: LayoutDashboard },
  { id: 'library', key: 'library', Icon: Library },
  { id: 'playlists', key: 'playlists', Icon: ListMusic },
  { id: 'favorites', key: 'favorites', Icon: Heart },
  { id: 'history', key: 'history', Icon: History },
  { id: 'mixes', key: 'mixes', Icon: Sparkles },
  { id: 'search', key: 'search', Icon: Search },
  { id: 'import-playlist', key: 'importPlaylist', Icon: ListPlus },
  { id: 'radio', key: 'radio', Icon: Radio },
  // Opt-in extras grouped just before Settings. Smart Playlists is still
  // experimental and ships hidden by default (see DEFAULT_HIDDEN_SIDEBAR_ITEMS).
  { id: 'smart-playlists', key: 'smartPlaylists', Icon: Wand2 },
  { id: 'downloads', key: 'downloads', Icon: DownloadCloud },
  { id: 'settings', key: 'settings', Icon: Settings },
];

/** Quick lookup of a nav item by its view id. */
export const SIDEBAR_ITEM_BY_ID = new Map(SIDEBAR_NAV_ITEMS.map(item => [item.id, item]));

/**
 * Views that can be reordered but never hidden. Settings is the escape hatch
 * back into this very customization UI, so it always stays visible.
 */
export const ALWAYS_VISIBLE_SIDEBAR_ITEMS: ReadonlySet<AppView> = new Set(['settings']);

/**
 * Views toggled off in the sidebar on a fresh install. Experimental / opt-in
 * features ship hidden — the user enables them from the sidebar customization
 * settings. Existing installs keep their own persisted visibility; this only
 * seeds the default and the "Reset sidebar" action.
 */
export const DEFAULT_HIDDEN_SIDEBAR_ITEMS: readonly AppView[] = ['smart-playlists'];

/**
 * Views still marked experimental. Surfaced as an "Experimental" badge in the
 * sidebar customization list so users know the feature may change or be removed.
 */
export const EXPERIMENTAL_SIDEBAR_ITEMS: ReadonlySet<AppView> = new Set(['smart-playlists']);

/** Default sidebar display order — the static order of {@link SIDEBAR_NAV_ITEMS}. */
export const DEFAULT_SIDEBAR_ORDER: AppView[] = SIDEBAR_NAV_ITEMS.map(item => item.id);

/**
 * Reconcile a (possibly stale) saved order against a canonical default order:
 * keep the saved order, drop ids no longer in `defaultOrder`, and append any
 * ids the saved order is missing (so entries added in a future version never
 * disappear). The result always contains every id in `defaultOrder` exactly
 * once — known ids in their saved order, missing ones appended in
 * `defaultOrder` sequence.
 */
export function reconcileOrder<T>(saved: unknown, defaultOrder: readonly T[]): T[] {
  const known = new Set<T>(defaultOrder);
  const seen = new Set<T>();
  const result: T[] = [];

  if (Array.isArray(saved)) {
    for (const id of saved) {
      if (known.has(id as T) && !seen.has(id as T)) {
        seen.add(id as T);
        result.push(id as T);
      }
    }
  }

  for (const id of defaultOrder) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }

  return result;
}

/**
 * Reconcile a (possibly stale) saved sidebar order against the current nav
 * items. See {@link reconcileOrder}; uses {@link DEFAULT_SIDEBAR_ORDER} as the
 * canonical order so views added in a future version never disappear and ids
 * dropped from the app never linger.
 */
export function sanitizeSidebarOrder(saved: unknown): AppView[] {
  return reconcileOrder(saved, DEFAULT_SIDEBAR_ORDER);
}
