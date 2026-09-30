import { acceptStoreHmr, clampNumber, createPersistedStore } from '@/lib/createPersistedStore';

/**
 * The ambience mixer: which cozy layers play under the music, and how loud.
 * The sound itself lives in `lib/ambient` (the engine only loads once
 * ambience is first heard); this store is just the listener's choices.
 *
 * localStorage-only: a lost mix costs a few slider drags, nothing more.
 */

const STORE_KEY = 'shiranami.ambient-store';

/** Every layer, in mixer order. `cafe` is the one recorded layer. */
export const AMBIENT_LAYER_IDS = ['rain', 'vinyl', 'noise', 'fire', 'cafe'] as const;

export type AmbientLayerId = (typeof AMBIENT_LAYER_IDS)[number];

export type AmbientLevels = Record<AmbientLayerId, number>;

/**
 * Slider positions (0 … 1) a fresh install starts from. Only rain is up, so
 * switching ambience on for the first time is audible without being busy.
 */
export const DEFAULT_AMBIENT_LEVELS: AmbientLevels = {
  rain: 0.5,
  vinyl: 0,
  noise: 0,
  fire: 0,
  cafe: 0,
};

/** Slider step; also the smallest level that counts as "on". */
export const AMBIENT_LEVEL_STEP = 0.01;

interface PersistedAmbientState {
  /** Master switch. Off means nothing is synthesized, decoded or scheduled. */
  enabled: boolean;
  levels: AmbientLevels;
  /** Keep ambience going while the music is paused (default: it pauses too). */
  keepWhenPaused: boolean;
  /** Raise the rain layer while the opt-in weather reports rain. */
  followWeather: boolean;
}

interface AmbientActions {
  /**
   * Switch ambience on or off. Switching on with every layer at zero brings
   * the default mix back, so the switch never looks on while playing silence.
   */
  setEnabled: (on: boolean) => void;
  setLevel: (id: AmbientLayerId, level: number) => void;
  setKeepWhenPaused: (on: boolean) => void;
  setFollowWeather: (on: boolean) => void;
  /** Back to the default mix. Leaves the master switch where it is. */
  resetLevels: () => void;
}

export type AmbientState = PersistedAmbientState & AmbientActions;

const DEFAULT_STATE: PersistedAmbientState = {
  enabled: false,
  levels: DEFAULT_AMBIENT_LEVELS,
  keepWhenPaused: false,
  followWeather: false,
};

function isLayerId(id: unknown): id is AmbientLayerId {
  return (AMBIENT_LAYER_IDS as readonly unknown[]).includes(id);
}

function clampLevel(level: unknown): number {
  return clampNumber(level, 0, 1, 0);
}

export function hasAudibleLevel(levels: AmbientLevels): boolean {
  return AMBIENT_LAYER_IDS.some(id => levels[id] >= AMBIENT_LEVEL_STEP);
}

/** Validate a persisted level map: unknown keys dropped, missing ones defaulted. */
function sanitizeLevels(value: unknown): AmbientLevels {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const out = { ...DEFAULT_AMBIENT_LEVELS };
  for (const id of AMBIENT_LAYER_IDS) {
    if (id in raw) out[id] = clampLevel(raw[id]);
  }
  return out;
}

function sanitize(persisted: unknown): Partial<PersistedAmbientState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const raw = persisted as Partial<Record<keyof PersistedAmbientState, unknown>>;
  const out: Partial<PersistedAmbientState> = {};
  if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
  if (raw.levels !== undefined) out.levels = sanitizeLevels(raw.levels);
  if (typeof raw.keepWhenPaused === 'boolean') out.keepWhenPaused = raw.keepWhenPaused;
  if (typeof raw.followWeather === 'boolean') out.followWeather = raw.followWeather;
  return out;
}

export const useAmbientStore = createPersistedStore<AmbientState>(
  (set, get) => ({
    ...DEFAULT_STATE,

    setEnabled: on => {
      if (on && !hasAudibleLevel(get().levels)) {
        set({ enabled: true, levels: { ...DEFAULT_AMBIENT_LEVELS } });
        return;
      }
      set({ enabled: on });
    },

    setLevel: (id, level) => {
      if (!isLayerId(id)) return;
      const next = clampLevel(level);
      if (get().levels[id] === next) return;
      set(s => ({ levels: { ...s.levels, [id]: next } }));
    },

    setKeepWhenPaused: on => set({ keepWhenPaused: on }),

    setFollowWeather: on => set({ followWeather: on }),

    resetLevels: () => set({ levels: { ...DEFAULT_AMBIENT_LEVELS } }),
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedAmbientState => ({
      enabled: s.enabled,
      levels: s.levels,
      keepWhenPaused: s.keepWhenPaused,
      followWeather: s.followWeather,
    }),
    sanitize: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
  }
);

acceptStoreHmr(useAmbientStore, import.meta.hot);
