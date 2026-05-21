import { create, type StateCreator } from 'zustand';
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware';

/* ── Field coercers ────────────────────────────────────────────────────── */

/**
 * Coerce an unknown value to one of `allowed`, falling back to `fallback`
 * when it isn't a member. Replaces the per-store `coerceX` enum-whitelist
 * helpers (theme, visualizer style, grid size, sort mode, …).
 */
export function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return (allowed as readonly string[]).includes(value as string) ? (value as T) : fallback;
}

/**
 * Coerce an unknown value to a finite number clamped to `[min, max]`, falling
 * back to `fallback` for non-numeric input. Replaces the per-store numeric
 * clamp helpers (uiScale, preampDb, opacity, …).
 */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/* ── One-shot legacy localStorage import ──────────────────────────────────── */

type LegacyFieldReader<T> = (raw: string) => T | undefined;

/**
 * One-shot migration of legacy flat localStorage keys into a single
 * persist-middleware bucket. No-op when the new `storeKey` already exists or
 * no legacy keys are present. For each `[field, { legacyKey, parse }]` entry
 * the raw value is read, parsed, and (if defined) written into the migrated
 * state; the bucket is then saved as `{ state, version }` and the legacy keys
 * removed — matching the existing importLegacyUIStore/importLegacyPlayerStore
 * shape.
 */
export function migrateLegacyKeys<TState extends Record<string, unknown>>(
  storeKey: string,
  mapping: {
    [K in keyof TState]?: { legacyKey: string; parse: LegacyFieldReader<TState[K]> };
  },
  options: { version?: number } = {}
): void {
  if (typeof window === 'undefined') return;
  const ls = window.localStorage;
  if (ls.getItem(storeKey)) return;

  const entries = Object.entries(mapping) as Array<
    [keyof TState, { legacyKey: string; parse: LegacyFieldReader<TState[keyof TState]> }]
  >;

  const hasAny = entries.some(([, m]) => ls.getItem(m.legacyKey) !== null);
  if (!hasAny) return;

  const state: Partial<TState> = {};
  for (const [field, m] of entries) {
    const raw = ls.getItem(m.legacyKey);
    if (raw === null) continue;
    const parsed = m.parse(raw);
    if (parsed !== undefined) state[field] = parsed;
  }

  ls.setItem(storeKey, JSON.stringify({ state, version: options.version ?? 1 }));
  for (const [, m] of entries) ls.removeItem(m.legacyKey);
}

/* ── HMR replay ───────────────────────────────────────────────────────────── */

interface StoreHmrData<TStore> {
  store?: TStore;
}

/**
 * Replace the 15 copy-pasted `if (import.meta.hot) { … }` blocks. On hot
 * reload, copies the previous module instance's state into the new store so a
 * dev edit doesn't reset persisted state, then stashes the new store for the
 * next reload. `onRestore` lets a store re-apply side effects (e.g. re-apply a
 * `data-theme` attribute) with the restored state.
 */
export function acceptStoreHmr<
  TStore extends { getState: () => unknown; setState: (partial: never) => void },
>(
  store: TStore,
  hot: { data?: unknown; accept: () => void } | undefined,
  onRestore?: (state: ReturnType<TStore['getState']>) => void
): void {
  if (!hot) return;
  const data = (hot.data ?? {}) as StoreHmrData<TStore>;
  if (data.store) {
    const prevState = data.store.getState() as ReturnType<TStore['getState']>;
    store.setState(prevState as never);
    onRestore?.(prevState);
  }
  data.store = store;
  hot.accept();
}

/* ── Store factory ────────────────────────────────────────────────────────── */

interface CreatePersistedStoreConfig<TState> {
  /** localStorage key. */
  name: string;
  /** Persist schema version. */
  version?: number;
  /** Pick the persisted slice (defaults to the whole state). */
  partialize?: PersistOptions<TState, Partial<TState>>['partialize'];
  /**
   * Defensive merge of the persisted slice over the initial state. Receives the
   * raw persisted value (untrusted) + the freshly created state; returns the
   * merged state. Use the `coerceEnum`/`clampNumber` helpers here.
   */
  sanitize?: (persisted: unknown, current: TState) => TState;
  /** Re-apply side effects after rehydration (e.g. apply a theme attribute). */
  onRehydrate?: (state: TState) => void;
}

/**
 * Assemble a zustand store wrapped in the `persist` middleware from a config,
 * removing the per-store boilerplate (storage, merge, onRehydrateStorage). The
 * caller still supplies the state creator and (optionally) a `sanitize` merge.
 *
 * The factory exists for Phase 2; only `useThemeStore` is migrated onto it as a
 * reference. Migrating the remaining persisted stores is Phase 3.
 */
export function createPersistedStore<TState>(
  initializer: StateCreator<TState>,
  config: CreatePersistedStoreConfig<TState>
) {
  const { name, version = 1, partialize, sanitize, onRehydrate } = config;

  return create<TState>()(
    persist(initializer, {
      name,
      version,
      storage: createJSONStorage(() => localStorage),
      ...(partialize ? { partialize } : {}),
      merge: (persisted, current) =>
        sanitize ? sanitize(persisted, current) : { ...current, ...(persisted as object) },
      ...(onRehydrate
        ? {
            onRehydrateStorage: () => state => {
              if (state) onRehydrate(state);
            },
          }
        : {}),
    })
  );
}
