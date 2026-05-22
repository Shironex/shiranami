import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';
import { IS_ELECTRON } from '@/lib/platform';

/** localStorage key — matches the shiranami.* store convention. */
const STORE_KEY = 'shiranami.onboarding';
/** electron-store mirror key — matches the app.language convention. */
const ELECTRON_KEY = 'app.onboardingCompleted';

function coerceCompleted(v: unknown): boolean {
  return v === true;
}

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  /** Mark the first-run wizard as done + mirror to electron-store. */
  completeOnboarding: () => void;
  /** Re-show the wizard (replay from Settings) + clear the electron-store mirror. */
  resetOnboarding: () => void;
  /** One-way sync from electron-store on boot: upgrades a cleared/un-migrated
   *  localStorage to completed when the mirror says so. localStorage is the
   *  working source of truth; the mirror only upgrades it, never downgrades. */
  hydrateOnboarding: () => Promise<void>;
}

export const useOnboardingStore = createPersistedStore<OnboardingState>(
  set => ({
    hasCompletedOnboarding: false,
    completeOnboarding: () => {
      set({ hasCompletedOnboarding: true });
      if (IS_ELECTRON) {
        window.electronAPI.store.set(ELECTRON_KEY, true).catch(() => {});
      }
    },
    resetOnboarding: () => {
      set({ hasCompletedOnboarding: false });
      if (IS_ELECTRON) {
        window.electronAPI.store.delete(ELECTRON_KEY).catch(() => {});
      }
    },
    hydrateOnboarding: async () => {
      if (!IS_ELECTRON) return;
      try {
        const stored = await window.electronAPI.store.get(ELECTRON_KEY);
        if (stored === true) {
          set({ hasCompletedOnboarding: true });
        }
      } catch {
        // Ignore store read failures — localStorage stays the fallback.
      }
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: s => ({ hasCompletedOnboarding: s.hasCompletedOnboarding }),
    sanitize: (persisted, current) => ({
      ...current,
      hasCompletedOnboarding: coerceCompleted(
        (persisted as Partial<OnboardingState> | undefined)?.hasCompletedOnboarding
      ),
    }),
  }
);

acceptStoreHmr(useOnboardingStore, import.meta.hot, state => {
  useOnboardingStore.setState({
    hasCompletedOnboarding: coerceCompleted(state.hasCompletedOnboarding),
  });
});
