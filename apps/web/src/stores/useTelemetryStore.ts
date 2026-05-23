import { toast } from 'sonner';
import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';

/** localStorage key — matches the shiranami.* store convention. */
const STORE_KEY = 'shiranami.telemetry';
/** electron-store mirror keys — the main process reads these to gate Sentry. */
const ELECTRON_KEY = 'app.telemetryEnabled';
const ELECTRON_PERF_KEY = 'app.performanceMonitoringEnabled';

function coerceEnabled(v: unknown): boolean {
  return v === true;
}

interface TelemetryState {
  /** Whether the user has opted in to crash/error reporting. Default OFF. */
  enabled: boolean;
  /**
   * Opt-in performance tracing — a sub-option of crash reporting (only meaningful
   * when `enabled` is also true). Default OFF.
   */
  performanceEnabled: boolean;
  /**
   * The flags as the main process saw them at launch. Sentry reads its config
   * once, before the app 'ready' event, so toggling either flag only takes
   * effect after a restart; comparing the live flags to these snapshots tells
   * the UI when a restart is pending. Set only by hydrate() at boot, so the
   * value survives navigating away from and back to the settings panel.
   */
  bootEnabled: boolean;
  bootPerformanceEnabled: boolean;
  /**
   * Set consent + mirror to electron-store. Writing the mirror triggers the
   * main process's onDidChange listener, which initializes or closes Sentry at
   * runtime (in packaged builds). On write failure the optimistic value is
   * reverted so the renderer never disagrees with the main-process gate.
   */
  setEnabled: (value: boolean) => Promise<void>;
  /** Set performance-monitoring opt-in + mirror to electron-store. */
  setPerformanceEnabled: (value: boolean) => Promise<void>;
  /** One-way sync from electron-store on boot (the mirror is authoritative for
   *  the actual reporting gate, so it can both upgrade and downgrade here). */
  hydrate: () => Promise<void>;
}

export const useTelemetryStore = createPersistedStore<TelemetryState>(
  (set, get) => ({
    enabled: false,
    performanceEnabled: false,
    bootEnabled: false,
    bootPerformanceEnabled: false,
    setEnabled: async (value: boolean) => {
      const previous = get().enabled;
      set({ enabled: value });
      if (!IS_ELECTRON) return;
      try {
        await window.electronAPI.store.set(ELECTRON_KEY, value);
      } catch (err) {
        // Revert so renderer consent never drifts from the main-process gate.
        set({ enabled: previous });
        console.error('[telemetry] failed to persist consent', err);
        toast.error(i18n.t('settings:priv.saveError'));
      }
    },
    setPerformanceEnabled: async (value: boolean) => {
      const previous = get().performanceEnabled;
      set({ performanceEnabled: value });
      if (!IS_ELECTRON) return;
      try {
        await window.electronAPI.store.set(ELECTRON_PERF_KEY, value);
      } catch (err) {
        set({ performanceEnabled: previous });
        console.error('[telemetry] failed to persist performance consent', err);
        toast.error(i18n.t('settings:priv.saveError'));
      }
    },
    hydrate: async () => {
      if (!IS_ELECTRON) return;
      try {
        const [stored, storedPerf] = await Promise.all([
          window.electronAPI.store.get(ELECTRON_KEY),
          window.electronAPI.store.get(ELECTRON_PERF_KEY),
        ]);
        const enabled = stored === true;
        const performanceEnabled = storedPerf === true;
        set({
          enabled,
          performanceEnabled,
          // Snapshot what main initialized Sentry with this launch.
          bootEnabled: enabled,
          bootPerformanceEnabled: performanceEnabled,
        });
      } catch {
        // Ignore store read failures — localStorage stays the fallback.
      }
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: s => ({ enabled: s.enabled, performanceEnabled: s.performanceEnabled }),
    sanitize: (persisted, current) => {
      const p = persisted as Partial<TelemetryState> | undefined;
      const enabled = coerceEnabled(p?.enabled);
      const performanceEnabled = coerceEnabled(p?.performanceEnabled);
      return {
        ...current,
        enabled,
        performanceEnabled,
        // Seed boot snapshots from the persisted values so the UI doesn't flash
        // a spurious "restart needed" before hydrate() reconciles with main.
        bootEnabled: enabled,
        bootPerformanceEnabled: performanceEnabled,
      };
    },
  }
);

acceptStoreHmr(useTelemetryStore, import.meta.hot, state => {
  useTelemetryStore.setState({
    enabled: coerceEnabled(state.enabled),
    performanceEnabled: coerceEnabled(state.performanceEnabled),
  });
});
