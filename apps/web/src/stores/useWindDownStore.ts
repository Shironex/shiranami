import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';

/**
 * Memory of the last completed wind-down: the moment the fade ran out to
 * silence. Powers the two soft surfaces around the sleep timer's ending —
 * the closing line as the screen settles, and the next-launch "you drifted
 * off at HH:MM" note in the Overview greeting.
 *
 * localStorage-only (no backend mirror): losing this on a profile wipe costs
 * one greeting line, nothing more.
 */

const STORE_KEY = 'shiranami.wind-down';

/**
 * Selectable wind-down lengths (minutes). 0 = off: the sleep timer's
 * wind-down option is disabled until the listener picks a length again.
 */
export const WIND_DOWN_LENGTH_CHOICES = [0, 5, 10, 15, 20] as const;

export type WindDownLength = (typeof WIND_DOWN_LENGTH_CHOICES)[number];

/** The authored default — the length the ending was originally written for. */
export const DEFAULT_WIND_DOWN_MINUTES: WindDownLength = 15;

function coerceLength(value: unknown): WindDownLength {
  return (WIND_DOWN_LENGTH_CHOICES as readonly unknown[]).includes(value)
    ? (value as WindDownLength)
    : DEFAULT_WIND_DOWN_MINUTES;
}

/** How long the closing line lingers after the fade completes. */
export const CLOSING_LINE_MS = 8_000;

/** The drift note goes quiet once the memory is older than this. */
export const DRIFT_NOTE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * Same-session floor: a completion younger than this is "you're asleep right
 * now", not a memory — the note only reads warm once some night has passed.
 */
export const DRIFT_NOTE_MIN_AGE_MS = 3 * 60 * 60 * 1000;

/** Wall-clock moment this renderer session started. */
const LAUNCHED_AT = Date.now();

export interface WindDownCompletion {
  /** ISO-8601 timestamp of the moment playback faded out. */
  at: string;
  /** Title of the track that carried the listener out, when known. */
  trackTitle: string | null;
}

/**
 * Whether the greeting should carry the "you drifted off at HH:MM" note.
 * Pure so the timezone/age edges are unit-testable: eligible when a completion
 * exists, hasn't been acknowledged, is fresh enough to feel like last night,
 * and either predates this launch (the true next-launch case) or — for an app
 * left open all night — is old enough that a morning has plausibly passed.
 */
export function shouldShowDriftNote(
  completion: WindDownCompletion | null,
  acknowledged: boolean,
  now: number,
  launchedAt: number = LAUNCHED_AT
): boolean {
  if (!completion || acknowledged) return false;
  const at = new Date(completion.at).getTime();
  if (Number.isNaN(at)) return false;
  const age = now - at;
  if (age < 0 || age > DRIFT_NOTE_MAX_AGE_MS) return false;
  return at < launchedAt || age >= DRIFT_NOTE_MIN_AGE_MS;
}

function coerceCompletion(value: unknown): WindDownCompletion | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<WindDownCompletion>;
  if (typeof record.at !== 'string') return null;
  return {
    at: record.at,
    trackTitle: typeof record.trackTitle === 'string' ? record.trackTitle : null,
  };
}

interface PersistedWindDownState {
  /** Last completed wind-down, or null when none has ever completed. */
  lastCompletion: WindDownCompletion | null;
  /** Whether the next-launch note for `lastCompletion` has already been shown. */
  noteAcknowledged: boolean;
  /** Wind-down length in minutes (0 = off). The sleep timer reads this. */
  lengthMinutes: WindDownLength;
}

interface WindDownState extends PersistedWindDownState {
  /**
   * Deadline (epoch ms) until which the closing line stays on screen, or null.
   * Transient — never persisted, so a relaunch never replays the goodbye.
   */
  closingLineUntil: number | null;
}

interface WindDownActions {
  /** Record a genuinely completed wind-down (fade ran out) and cue the closing line. */
  recordCompletion: (trackTitle: string | null) => void;
  /** Mark the drift note as shown so it never repeats for the same night. */
  acknowledgeDriftNote: () => void;
  /** Clear the closing line once its linger elapses. */
  clearClosingLine: () => void;
  /** Pick a wind-down length (0 = off). Non-members are ignored. */
  setLength: (minutes: WindDownLength) => void;
}

export const useWindDownStore = createPersistedStore<WindDownState & WindDownActions>(
  set => ({
    lastCompletion: null,
    noteAcknowledged: false,
    closingLineUntil: null,
    lengthMinutes: DEFAULT_WIND_DOWN_MINUTES,

    recordCompletion: trackTitle => {
      set({
        lastCompletion: { at: new Date().toISOString(), trackTitle },
        noteAcknowledged: false,
        closingLineUntil: Date.now() + CLOSING_LINE_MS,
      });
    },

    acknowledgeDriftNote: () => set({ noteAcknowledged: true }),

    clearClosingLine: () => set({ closingLineUntil: null }),

    setLength: minutes => set({ lengthMinutes: coerceLength(minutes) }),
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: s => ({
      lastCompletion: s.lastCompletion,
      noteAcknowledged: s.noteAcknowledged,
      lengthMinutes: s.lengthMinutes,
    }),
    sanitize: (persisted, current) => {
      const raw = persisted as Partial<PersistedWindDownState> | undefined;
      return {
        ...current,
        lastCompletion: coerceCompletion(raw?.lastCompletion),
        noteAcknowledged: raw?.noteAcknowledged === true,
        lengthMinutes: coerceLength(raw?.lengthMinutes),
      };
    },
  }
);

acceptStoreHmr(useWindDownStore, import.meta.hot, () => {
  useWindDownStore.setState({ closingLineUntil: null });
});
