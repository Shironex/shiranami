import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';
import { EQ_BANDS } from '@/lib/audioAnalyser';

const STORE_KEY = 'shiranami.eq-store';

/**
 * Preset identifier. `'custom'` is special — it is never something the user
 * selects directly; instead the store flips to `'custom'` automatically when
 * a band gain no longer matches any named preset.
 */
export type EqPresetId =
  | 'flat'
  | 'rock'
  | 'pop'
  | 'jazz'
  | 'classical'
  | 'electronic'
  | 'dance'
  | 'hiphop'
  | 'acoustic'
  | 'vocal'
  | 'bassboost'
  | 'trebleboost'
  | 'loudness'
  | 'custom';

export type NamedEqPresetId = Exclude<EqPresetId, 'custom'>;

/**
 * Named presets — arrays of dB gains ordered to match EQ_BANDS
 * (31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz).
 */
export const EQ_PRESETS: Record<NamedEqPresetId, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rock: [5, 3, -3.5, -5, -2, 2.5, 5.5, 6.5, 6.5, 6.5],
  pop: [-1, 3, 4.5, 5, 3.5, -0.5, -1.5, -1.5, -1, -1],
  jazz: [4, 3, 1.5, 2.5, -1.5, -1.5, 0, 1.5, 3, 4],
  classical: [0, 0, 0, 0, 0, 0, -4.5, -4.5, -4.5, -6],
  electronic: [5, 4, 1, -3.5, -3, 0.5, 5, 6, 6, 5.5],
  dance: [6, 4.5, 1.5, 0, 0, -3.5, -4.5, -4.5, 0, 0],
  hiphop: [5, 4.5, 1.5, 3, -1, -1.5, 1.5, -1, 2, 3],
  acoustic: [4, 3, 2, -1, -1, 1.5, 2.5, 2, 2.5, 2.5],
  vocal: [-1.5, -3, -3, 1.5, 3.5, 3.5, 3, 1.5, 0, -1.5],
  bassboost: [6, 6, 6, 3.5, 1, 0, 0, 0, 0, 0],
  trebleboost: [0, 0, 0, 0, 0, 1, 4, 6, 6, 7],
  loudness: [5, 4, 2, 0, -2, -3, -2, 0, 4, 5],
};

export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;
const BAND_COUNT = EQ_BANDS.length;
const GAIN_EPSILON = 0.001;

export interface EqState {
  enabled: boolean;
  preset: EqPresetId;
  preampDb: number;
  gains: number[];

  setEnabled: (on: boolean) => void;
  setBandGain: (index: number, db: number) => void;
  setPreampDb: (db: number) => void;
  applyPreset: (id: EqPresetId) => void;
  reset: () => void;
}

interface PersistedEqState {
  enabled: boolean;
  preset: EqPresetId;
  preampDb: number;
  gains: number[];
}

function clampDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, db));
}

function gainsMatch(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > GAIN_EPSILON) return false;
  }
  return true;
}

function detectPreset(gains: readonly number[]): EqPresetId {
  const entries = Object.entries(EQ_PRESETS) as [NamedEqPresetId, number[]][];
  for (const [id, preset] of entries) {
    if (gainsMatch(gains, preset)) return id;
  }
  return 'custom';
}

function isNamedPreset(id: string): id is NamedEqPresetId {
  return id !== 'custom' && id in EQ_PRESETS;
}

const DEFAULT_STATE: PersistedEqState = {
  enabled: false,
  preset: 'flat',
  preampDb: 0,
  gains: [...EQ_PRESETS.flat],
};

function sanitize(persisted: Partial<PersistedEqState> | undefined): Partial<PersistedEqState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedEqState> = {};

  if (typeof persisted.enabled === 'boolean') out.enabled = persisted.enabled;

  if (persisted.preampDb !== undefined) {
    out.preampDb = clampDb(Number(persisted.preampDb));
  }

  let gains: number[] | undefined;
  if (Array.isArray(persisted.gains)) {
    if (persisted.gains.length === BAND_COUNT) {
      gains = persisted.gains.map(v => clampDb(Number(v)));
    } else {
      gains = [...EQ_PRESETS.flat];
    }
  }
  if (gains) out.gains = gains;

  let preset: EqPresetId | undefined;
  if (typeof persisted.preset === 'string') {
    if (persisted.preset === 'custom' || isNamedPreset(persisted.preset)) {
      preset = persisted.preset;
    } else {
      preset = 'flat';
    }
  }
  if (preset) out.preset = preset;

  return out;
}

export const useEqStore = createPersistedStore<EqState>(
  (set, get) => ({
    enabled: DEFAULT_STATE.enabled,
    preset: DEFAULT_STATE.preset,
    preampDb: DEFAULT_STATE.preampDb,
    gains: [...DEFAULT_STATE.gains],

    setEnabled: on => set({ enabled: on }),

    setBandGain: (index, db) => {
      if (index < 0 || index >= BAND_COUNT) return;
      const clamped = clampDb(db);
      const gains = [...get().gains];
      if (Math.abs(gains[index] - clamped) <= GAIN_EPSILON) return;
      gains[index] = clamped;
      set({ gains, preset: detectPreset(gains) });
    },

    setPreampDb: db => set({ preampDb: clampDb(db) }),

    applyPreset: id => {
      if (id === 'custom') return;
      const preset = EQ_PRESETS[id];
      if (!preset) return;
      set({ preset: id, gains: [...preset] });
    },

    reset: () =>
      set({
        preset: 'flat',
        preampDb: 0,
        gains: [...EQ_PRESETS.flat],
      }),
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedEqState => ({
      enabled: s.enabled,
      preset: s.preset,
      preampDb: s.preampDb,
      gains: s.gains,
    }),
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedEqState>),
    }),
  }
);

acceptStoreHmr(useEqStore, import.meta.hot);
