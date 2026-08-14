import { createPersistedStore, coerceEnum, acceptStoreHmr } from '@/lib/createPersistedStore';
import { ROOM_LIGHT_STOP_SETTINGS, type RoomLightStopSetting } from '@/stores/useUIStore';

/**
 * How the shown background is chosen from the saved library:
 * the user's explicit pick, a rotation over every saved image, or a
 * time-of-day schedule mapping the room-light stops to specific images.
 */
export type BackgroundSelectionMode = 'single' | 'rotation' | 'timeOfDay';

export const BACKGROUND_SELECTION_MODES = [
  'single',
  'rotation',
  'timeOfDay',
] as const satisfies readonly BackgroundSelectionMode[];

export const BACKGROUND_SELECTION_MODE_DEFAULT: BackgroundSelectionMode = 'single';

/** How often the rotation advances to the next saved background. */
export type BackgroundRotationInterval = 'launch' | 'hourly' | 'daily';

export const BACKGROUND_ROTATION_INTERVALS = [
  'launch',
  'hourly',
  'daily',
] as const satisfies readonly BackgroundRotationInterval[];

export const BACKGROUND_ROTATION_INTERVAL_DEFAULT: BackgroundRotationInterval = 'daily';

/**
 * A slot the schedule can map — exactly the room-light stops, minus `auto`.
 * Backgrounds and room light read the same clock through
 * `roomLightStopKeyForHour`, so "night" means the same hours in both features.
 */
export type BackgroundScheduleSlot = Exclude<RoomLightStopSetting, 'auto'>;

export const BACKGROUND_SCHEDULE_SLOTS = ROOM_LIGHT_STOP_SETTINGS.filter(
  (setting): setting is BackgroundScheduleSlot => setting !== 'auto'
);

/** Saved-background entry ids keyed by the slot that shows them. */
export type BackgroundSchedule = Partial<Record<BackgroundScheduleSlot, string>>;

const STORE_KEY = 'shiranami.background-selection';

function coerceMode(v: unknown): BackgroundSelectionMode {
  return coerceEnum(v, BACKGROUND_SELECTION_MODES, BACKGROUND_SELECTION_MODE_DEFAULT);
}
function coerceInterval(v: unknown): BackgroundRotationInterval {
  return coerceEnum(v, BACKGROUND_ROTATION_INTERVALS, BACKGROUND_ROTATION_INTERVAL_DEFAULT);
}
function coerceSchedule(v: unknown): BackgroundSchedule {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: BackgroundSchedule = {};
  for (const slot of BACKGROUND_SCHEDULE_SLOTS) {
    const id = (v as Record<string, unknown>)[slot];
    if (typeof id === 'string' && id.length > 0) out[slot] = id;
  }
  return out;
}

interface PersistedBackgroundSelectionState {
  mode: BackgroundSelectionMode;
  rotationInterval: BackgroundRotationInterval;
  schedule: BackgroundSchedule;
}

interface BackgroundSelectionState extends PersistedBackgroundSelectionState {
  /**
   * Random per-session seed for the `launch` rotation interval. Deliberately
   * *not* persisted: a fresh draw per launch is the feature.
   */
  launchNonce: number;
}

interface BackgroundSelectionActions {
  setMode: (mode: BackgroundSelectionMode) => void;
  setRotationInterval: (interval: BackgroundRotationInterval) => void;
  /** Map a slot to a saved entry id, or clear it back to "the active pick". */
  setScheduleSlot: (slot: BackgroundScheduleSlot, id: string | null) => void;
  /**
   * Drop schedule references to entries that no longer exist. Called after a
   * delete so a removed background's slots quietly fall back to the active
   * pick instead of holding a dead id forever.
   */
  pruneScheduleTo: (validIds: readonly string[]) => void;
}

export const useBackgroundSelectionStore = createPersistedStore<
  BackgroundSelectionState & BackgroundSelectionActions
>(
  (set, get) => ({
    mode: BACKGROUND_SELECTION_MODE_DEFAULT,
    rotationInterval: BACKGROUND_ROTATION_INTERVAL_DEFAULT,
    schedule: {},
    launchNonce: Math.floor(Math.random() * 2 ** 30),

    setMode: mode => {
      set({ mode: coerceMode(mode) });
    },
    setRotationInterval: interval => {
      set({ rotationInterval: coerceInterval(interval) });
    },
    setScheduleSlot: (slot, id) => {
      const schedule = { ...get().schedule };
      if (id === null) {
        delete schedule[slot];
      } else {
        schedule[slot] = id;
      }
      set({ schedule });
    },
    pruneScheduleTo: validIds => {
      const current = get().schedule;
      const schedule: BackgroundSchedule = {};
      let changed = false;
      for (const slot of BACKGROUND_SCHEDULE_SLOTS) {
        const id = current[slot];
        if (id === undefined) continue;
        if (validIds.includes(id)) {
          schedule[slot] = id;
        } else {
          changed = true;
        }
      }
      if (changed) set({ schedule });
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedBackgroundSelectionState => ({
      mode: s.mode,
      rotationInterval: s.rotationInterval,
      schedule: s.schedule,
    }),
    sanitize: (persisted, current) => {
      const p = persisted as Partial<PersistedBackgroundSelectionState> | undefined;
      return {
        ...current,
        mode: p?.mode !== undefined ? coerceMode(p.mode) : current.mode,
        rotationInterval:
          p?.rotationInterval !== undefined
            ? coerceInterval(p.rotationInterval)
            : current.rotationInterval,
        schedule: p?.schedule !== undefined ? coerceSchedule(p.schedule) : current.schedule,
      };
    },
  }
);

acceptStoreHmr(useBackgroundSelectionStore, import.meta.hot);
