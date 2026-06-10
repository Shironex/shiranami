import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';
import { IS_ELECTRON } from '@/lib/platform';
import { logger } from '@/lib/logger';

/** localStorage key — matches the shiranami.* store convention. */
const STORE_KEY = 'shiranami.supportBanner';
/** electron-store mirror key — matches the app.onboardingCompleted convention. */
const ELECTRON_KEY = 'app.supportBannerSeen';

function coerceSeen(v: unknown): boolean {
  return v === true;
}

interface SupportBannerState {
  /** Whether the user has already seen (and dismissed or acted on) the launch banner. */
  seen: boolean;
  /** Mark the banner as seen so it never shows again + mirror to electron-store. */
  setSeen: () => void;
  /** Re-show the banner (dev/diagnostics) + clear the electron-store mirror. */
  reset: () => void;
  /** One-way sync from electron-store on boot: upgrades a cleared/un-migrated
   *  localStorage to seen when the mirror says so. localStorage is the working
   *  source of truth; the mirror only upgrades it, never downgrades. */
  hydrateSupportBanner: () => Promise<void>;
}

export const useSupportBannerStore = createPersistedStore<SupportBannerState>(
  set => ({
    seen: false,
    setSeen: () => {
      set({ seen: true });
      if (IS_ELECTRON) {
        window.electronAPI.store
          .set(ELECTRON_KEY, true)
          .catch(err => logger.warn('Failed to persist support-banner seen state', err));
      }
    },
    reset: () => {
      set({ seen: false });
      if (IS_ELECTRON) {
        window.electronAPI.store
          .delete(ELECTRON_KEY)
          .catch(err => logger.warn('Failed to clear support-banner seen state', err));
      }
    },
    hydrateSupportBanner: async () => {
      if (!IS_ELECTRON) return;
      try {
        const stored = await window.electronAPI.store.get(ELECTRON_KEY);
        if (stored === true) {
          set({ seen: true });
        }
      } catch {
        // Ignore store read failures — localStorage stays the fallback.
      }
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: s => ({ seen: s.seen }),
    sanitize: (persisted, current) => ({
      ...current,
      seen: coerceSeen((persisted as Partial<SupportBannerState> | undefined)?.seen),
    }),
  }
);

acceptStoreHmr(useSupportBannerStore, import.meta.hot, state => {
  useSupportBannerStore.setState({
    seen: coerceSeen(state.seen),
  });
});
