/**
 * Feature-detected access to the companion ledger. The Rust side
 * (`companion:*` commands + the `companion:xp` event) lands in a parallel
 * lane, so this module only *probes* `window.electronAPI.companion` — it does
 * not import the bridge or restate contracts. When the surface is absent
 * (v1 preload, browser dev, tests, or the lane not merged yet) every caller
 * falls back to the local default: stage 0, species from `useCompanionStore`.
 */

export interface ICompanionBackendState {
  name: string | null;
  /** Monotonic evolution stage (0–4). */
  stage: number;
  /** Lifetime XP accumulator, seconds-derived. */
  xp: number;
  /** Persisted species id ('shio' | 'hotaru'), when the ledger carries one. */
  species: string | null;
  /** Worn accessory ids, as stored — the catalog vocabulary lives renderer-side. */
  accessories: string[];
  /**
   * ISO-8601 instant of the *previous* sighting (the read stamps the new one
   * after returning), so return-after-absence is computable from one call.
   * Null on the very first read or when the wire shape lacks it.
   */
  lastSeenAt: string | null;
}

export interface ICompanionXpEvent {
  totalXp: number;
  stage: number;
  leveledUp: boolean;
}

export interface ICompanionBackendApi {
  getState: () => Promise<ICompanionBackendState>;
  setName: (name: string) => Promise<void>;
  setSpecies: (species: string) => Promise<void>;
  /** Replace the worn accessory set — the whole set every time, never a delta. */
  setAccessories: (accessories: string[]) => Promise<void>;
  /** Subscribe to `companion:xp`; returns the unsubscribe. */
  onXp: (callback: (event: ICompanionXpEvent) => void) => () => void;
}

interface RawCompanionSurface {
  getState?: unknown;
  setName?: unknown;
  setSpecies?: unknown;
  setAccessories?: unknown;
  onXp?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Tolerant read of the ledger state — unknown wire shapes degrade to defaults. */
export function normalizeCompanionState(raw: unknown): ICompanionBackendState {
  const rec = asRecord(raw);
  return {
    name: typeof rec?.name === 'string' && rec.name.length > 0 ? rec.name : null,
    stage: numberOr(rec?.stage, 0),
    xp: numberOr(rec?.xp, 0),
    species: typeof rec?.species === 'string' ? rec.species : null,
    accessories: Array.isArray(rec?.accessories)
      ? rec.accessories.filter((id): id is string => typeof id === 'string')
      : [],
    lastSeenAt: typeof rec?.lastSeenAt === 'string' ? rec.lastSeenAt : null,
  };
}

/**
 * Tolerant read of the xp event. The tech research names the payload
 * `{ xpGained, totalXp, level, leveledUp }`; the decision record renamed
 * `level` → `stage`, so both spellings are accepted.
 */
export function normalizeCompanionXpEvent(raw: unknown): ICompanionXpEvent {
  const rec = asRecord(raw);
  return {
    totalXp: numberOr(rec?.totalXp, 0),
    stage: numberOr(rec?.stage, numberOr(rec?.level, 0)),
    leveledUp: rec?.leveledUp === true,
  };
}

/**
 * The feature probe. Returns a typed surface when the ledger namespace is
 * present and complete, null otherwise — never throws, never partially binds.
 */
export function getCompanionApi(): ICompanionBackendApi | null {
  if (typeof window === 'undefined') return null;
  const electronAPI = asRecord((window as { electronAPI?: unknown }).electronAPI);
  const surface = asRecord(electronAPI?.companion) as RawCompanionSurface | null;
  if (!surface) return null;
  const { getState, setName, setSpecies, setAccessories, onXp } = surface;
  if (
    typeof getState !== 'function' ||
    typeof setName !== 'function' ||
    typeof setSpecies !== 'function' ||
    typeof setAccessories !== 'function' ||
    typeof onXp !== 'function'
  ) {
    return null;
  }

  return {
    getState: async () => normalizeCompanionState(await (getState as () => Promise<unknown>)()),
    setName: name => (setName as (n: string) => Promise<void>)(name),
    setSpecies: species => (setSpecies as (s: string) => Promise<void>)(species),
    setAccessories: accessories => (setAccessories as (a: string[]) => Promise<void>)(accessories),
    onXp: callback => {
      const unsubscribe = (onXp as (cb: (e: unknown) => void) => unknown)(raw =>
        callback(normalizeCompanionXpEvent(raw))
      );
      return typeof unsubscribe === 'function' ? (unsubscribe as () => void) : () => {};
    },
  };
}
