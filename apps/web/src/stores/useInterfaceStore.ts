import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';

/**
 * Visibility of optional interface chrome — the top-bar language switcher and
 * the individual Overview widgets. Everything defaults to visible so the
 * store is a pure opt-out surface; the greeting hero stays unconditional
 * (it anchors the view and hosts the separately-toggled weather widget).
 */

const STORE_KEY = 'shiranami.interface-store';

interface PersistedInterfaceState {
  topBarLanguageSwitcher: boolean;
  overviewStats: boolean;
  overviewTopWeek: boolean;
  overviewClock: boolean;
  overviewTopAlbums: boolean;
  overviewMixes: boolean;
  overviewRecommendations: boolean;
  overviewRecentlyAdded: boolean;
}

export const INTERFACE_DEFAULTS: PersistedInterfaceState = {
  topBarLanguageSwitcher: true,
  overviewStats: true,
  overviewTopWeek: true,
  overviewClock: true,
  overviewTopAlbums: true,
  overviewMixes: true,
  overviewRecommendations: true,
  overviewRecentlyAdded: true,
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
