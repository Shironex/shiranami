import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';
import { IS_ELECTRON } from '@/lib/platform';

/** localStorage key — matches the shiranami.* store convention. */
const STORE_KEY = 'shiranami.telemetry';
/** electron-store mirror key — the main process reads this to gate Sentry. */
const ELECTRON_KEY = 'app.telemetryEnabled';

function coerceEnabled(v: unknown): boolean {
  return v === true;
}

interface TelemetryState {
  /** Whether the user has opted in to crash/error reporting. Default OFF. */
  enabled: boolean;
  /**
   * Set consent + mirror to electron-store. Writing the mirror triggers the
   * main process's onDidChange listener, which initializes or closes Sentry at
   * runtime (in packaged builds).
   */
  setEnabled: (value: boolean) => void;
  /** One-way sync from electron-store on boot (the mirror is authoritative for
   *  the actual reporting gate, so it can both upgrade and downgrade here). */
  hydrate: () => Promise<void>;
}

export const useTelemetryStore = createPersistedStore<TelemetryState>(
  set => ({
    enabled: false,
    setEnabled: (value: boolean) => {
      set({ enabled: value });
      if (IS_ELECTRON) {
        window.electronAPI.store.set(ELECTRON_KEY, value).catch(() => {});
      }
    },
    hydrate: async () => {
      if (!IS_ELECTRON) return;
      try {
        const stored = await window.electronAPI.store.get(ELECTRON_KEY);
        set({ enabled: stored === true });
      } catch {
        // Ignore store read failures — localStorage stays the fallback.
      }
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: s => ({ enabled: s.enabled }),
    sanitize: (persisted, current) => ({
      ...current,
      enabled: coerceEnabled((persisted as Partial<TelemetryState> | undefined)?.enabled),
    }),
  }
);

acceptStoreHmr(useTelemetryStore, import.meta.hot, state => {
  useTelemetryStore.setState({ enabled: coerceEnabled(state.enabled) });
});
