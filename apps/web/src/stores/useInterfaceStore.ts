import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';
import { arrayMove } from '@/lib/array';
import {
  DEFAULT_OVERVIEW_ORDER,
  sanitizeOverviewOrder,
  type OverviewSectionId,
} from '@/lib/overview-sections';

/**
 * Visibility of optional interface chrome — the top-bar language switcher,
 * the individual Overview widgets, and the player bar's secondary elements —
 * plus the display order of the Overview's sections. Everything defaults to
 * visible so the toggles are a pure opt-out surface; the greeting hero and
 * core playback controls (play/seek) stay unconditional.
 */

const STORE_KEY = 'shiranami.interface-store';

interface PersistedInterfaceToggles {
  topBarLanguageSwitcher: boolean;
  /** The resident companion (Shio/Hotaru) across all its perches. */
  companion: boolean;
  overviewRecap: boolean;
  overviewStats: boolean;
  overviewTopWeek: boolean;
  overviewClock: boolean;
  overviewTopAlbums: boolean;
  overviewMixes: boolean;
  overviewRecommendations: boolean;
  overviewRecentlyAdded: boolean;
  playerAlbumArt: boolean;
  playerFavorite: boolean;
  playerTimeLabels: boolean;
  playerWaveformSeekbar: boolean;
  playerSleepTimer: boolean;
  playerEqualizer: boolean;
  playerCompactButton: boolean;
  playerVisualizerButton: boolean;
  playerLyricsButton: boolean;
  playerQueueButton: boolean;
  playerVolume: boolean;
}

interface PersistedInterfaceState extends PersistedInterfaceToggles {
  /** Overview section display order, reconciled against the current sections. */
  overviewOrder: OverviewSectionId[];
}

const TOGGLE_DEFAULTS: PersistedInterfaceToggles = {
  topBarLanguageSwitcher: true,
  companion: true,
  overviewRecap: true,
  overviewStats: true,
  overviewTopWeek: true,
  overviewClock: true,
  overviewTopAlbums: true,
  overviewMixes: true,
  overviewRecommendations: true,
  overviewRecentlyAdded: true,
  playerAlbumArt: true,
  playerFavorite: true,
  playerTimeLabels: true,
  playerWaveformSeekbar: true,
  playerSleepTimer: true,
  playerEqualizer: true,
  playerCompactButton: true,
  playerVisualizerButton: true,
  playerLyricsButton: true,
  playerQueueButton: true,
  playerVolume: true,
};

export const INTERFACE_DEFAULTS: PersistedInterfaceState = {
  ...TOGGLE_DEFAULTS,
  overviewOrder: DEFAULT_OVERVIEW_ORDER,
};

/** Every boolean visibility key, in declaration order. */
export const INTERFACE_TOGGLE_KEYS = Object.keys(TOGGLE_DEFAULTS) as Array<
  keyof PersistedInterfaceToggles
>;

function sanitize(
  persisted: Partial<PersistedInterfaceState> | undefined
): Partial<PersistedInterfaceState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedInterfaceState> = {};
  for (const key of INTERFACE_TOGGLE_KEYS) {
    if (typeof persisted[key] === 'boolean') out[key] = persisted[key];
  }
  if (persisted.overviewOrder !== undefined)
    out.overviewOrder = sanitizeOverviewOrder(persisted.overviewOrder);
  return out;
}

interface InterfaceActions {
  setVisible: (key: keyof PersistedInterfaceToggles, visible: boolean) => void;
  reorderOverviewSection: (activeId: OverviewSectionId, overId: OverviewSectionId) => void;
  resetInterface: () => void;
}

export type InterfaceElementKey = keyof PersistedInterfaceToggles;

export const useInterfaceStore = createPersistedStore<PersistedInterfaceState & InterfaceActions>(
  (set, get) => ({
    ...INTERFACE_DEFAULTS,
    setVisible: (key, visible) => {
      set({ [key]: visible } as Partial<PersistedInterfaceState>);
    },
    reorderOverviewSection: (activeId, overId) => {
      const order = get().overviewOrder;
      const oldIndex = order.indexOf(activeId);
      const newIndex = order.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      set({ overviewOrder: arrayMove(order, oldIndex, newIndex) });
    },
    resetInterface: () => {
      set({ ...INTERFACE_DEFAULTS });
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedInterfaceState => {
      const out = {} as PersistedInterfaceState;
      for (const key of INTERFACE_TOGGLE_KEYS) out[key] = s[key];
      out.overviewOrder = s.overviewOrder;
      return out;
    },
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedInterfaceState>),
    }),
  }
);

acceptStoreHmr(useInterfaceStore, import.meta.hot);
