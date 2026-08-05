import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';

/**
 * Visibility of optional interface chrome — the top-bar language switcher,
 * the individual Overview widgets, and the player bar's secondary elements.
 * Everything defaults to visible so the store is a pure opt-out surface; the
 * greeting hero and core playback controls (play/seek) stay unconditional.
 */

const STORE_KEY = 'shiranami.interface-store';

interface PersistedInterfaceState {
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

export const INTERFACE_DEFAULTS: PersistedInterfaceState = {
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

const INTERFACE_KEYS = Object.keys(INTERFACE_DEFAULTS) as Array<keyof PersistedInterfaceState>;

function sanitize(
  persisted: Partial<PersistedInterfaceState> | undefined
): Partial<PersistedInterfaceState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedInterfaceState> = {};
  for (const key of INTERFACE_KEYS) {
    if (typeof persisted[key] === 'boolean') out[key] = persisted[key];
  }
  return out;
}

interface InterfaceActions {
  setVisible: (key: keyof PersistedInterfaceState, visible: boolean) => void;
  resetInterface: () => void;
}

export type InterfaceElementKey = keyof PersistedInterfaceState;

export const useInterfaceStore = createPersistedStore<PersistedInterfaceState & InterfaceActions>(
  set => ({
    ...INTERFACE_DEFAULTS,
    setVisible: (key, visible) => {
      set({ [key]: visible } as Partial<PersistedInterfaceState>);
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
      for (const key of INTERFACE_KEYS) out[key] = s[key];
      return out;
    },
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedInterfaceState>),
    }),
  }
);

acceptStoreHmr(useInterfaceStore, import.meta.hot);
