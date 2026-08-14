import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';
import { IS_ELECTRON } from '@/lib/platform';
import { commands } from '@/lib/bridge/commands';
import { logger } from '@/lib/logger';

/** What the sanctuary shows center-stage. */
export type SanctuaryVariant = 'cover' | 'clock' | 'vinyl';

/** How the clock variant draws its numerals. */
export type SanctuaryClockFace = 'minimal' | 'serif' | 'oversized';

/** Hour convention for the clock: follow the app language, or force 12/24h. */
export type SanctuaryClockFormat = 'system' | '12h' | '24h';

export const SANCTUARY_AUTO_ENTER_MIN_MINUTES = 1;
export const SANCTUARY_AUTO_ENTER_MAX_MINUTES = 60;
export const SANCTUARY_AUTO_ENTER_DEFAULT_MINUTES = 5;
export const SANCTUARY_VARIANT_DEFAULT: SanctuaryVariant = 'cover';
export const SANCTUARY_CLOCK_FACE_DEFAULT: SanctuaryClockFace = 'minimal';
export const SANCTUARY_CLOCK_FORMAT_DEFAULT: SanctuaryClockFormat = 'system';

/** How long the chrome stays up after the last pointer/keyboard activity. */
export const SANCTUARY_CHROME_TIMEOUT_MS = 4000;

const STORE_KEY = 'shiranami.sanctuary-store';

function coerceVariant(v: unknown): SanctuaryVariant {
  return v === 'cover' || v === 'clock' || v === 'vinyl' ? v : SANCTUARY_VARIANT_DEFAULT;
}

function coerceClockFace(v: unknown): SanctuaryClockFace {
  return v === 'minimal' || v === 'serif' || v === 'oversized' ? v : SANCTUARY_CLOCK_FACE_DEFAULT;
}

function coerceClockFormat(v: unknown): SanctuaryClockFormat {
  return v === 'system' || v === '12h' || v === '24h' ? v : SANCTUARY_CLOCK_FORMAT_DEFAULT;
}

function coerceAutoEnterMinutes(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(parsed)) return SANCTUARY_AUTO_ENTER_DEFAULT_MINUTES;
  return Math.round(
    Math.min(SANCTUARY_AUTO_ENTER_MAX_MINUTES, Math.max(SANCTUARY_AUTO_ENTER_MIN_MINUTES, parsed))
  );
}

interface PersistedSanctuaryState {
  sanctuaryVariant: SanctuaryVariant;
  sanctuaryClockFace: SanctuaryClockFace;
  sanctuaryClockFormat: SanctuaryClockFormat;
  sanctuaryClockSeconds: boolean;
  sanctuaryAutoEnter: boolean;
  sanctuaryAutoEnterMinutes: number;
}

interface SanctuaryState extends PersistedSanctuaryState {
  /** Runtime-only: the fullscreen sanctuary is currently shown. */
  sanctuaryActive: boolean;
  /**
   * Runtime-only: the sanctuary entered by itself (screensaver). Auto-entries
   * exit on *any* activity; manual entries only surface their chrome.
   */
  sanctuaryAutoEntered: boolean;
}

interface SanctuaryActions {
  enterSanctuary: (options?: { auto?: boolean }) => void;
  exitSanctuary: () => void;
  toggleSanctuary: () => void;
  setSanctuaryVariant: (variant: SanctuaryVariant) => void;
  setSanctuaryClockFace: (face: SanctuaryClockFace) => void;
  setSanctuaryClockFormat: (format: SanctuaryClockFormat) => void;
  setSanctuaryClockSeconds: (enabled: boolean) => void;
  setSanctuaryAutoEnter: (enabled: boolean) => void;
  setSanctuaryAutoEnterMinutes: (minutes: number) => void;
}

/**
 * Ask the OS window to enter/leave fullscreen and hold/release the
 * display-sleep assertion. Both commands are infallible on the Rust side (a
 * refused fullscreen degrades to a windowed sanctuary); a rejected invoke is
 * logged and otherwise ignored for the same reason.
 */
function pushWindowState(active: boolean): void {
  if (!IS_ELECTRON) return;
  commands.windowSetFullscreen(active).catch((err: unknown) => {
    logger.warn('[sanctuary] set-fullscreen failed', err);
  });
  commands.windowSetDisplaySleepInhibited(active).catch((err: unknown) => {
    logger.warn('[sanctuary] display-sleep inhibition failed', err);
  });
}

export const useSanctuaryStore = createPersistedStore<SanctuaryState & SanctuaryActions>(
  (set, get) => ({
    sanctuaryVariant: SANCTUARY_VARIANT_DEFAULT,
    sanctuaryClockFace: SANCTUARY_CLOCK_FACE_DEFAULT,
    sanctuaryClockFormat: SANCTUARY_CLOCK_FORMAT_DEFAULT,
    sanctuaryClockSeconds: false,
    sanctuaryAutoEnter: false,
    sanctuaryAutoEnterMinutes: SANCTUARY_AUTO_ENTER_DEFAULT_MINUTES,
    sanctuaryActive: false,
    sanctuaryAutoEntered: false,

    enterSanctuary: options => {
      if (get().sanctuaryActive) return;
      set({ sanctuaryActive: true, sanctuaryAutoEntered: options?.auto === true });
      pushWindowState(true);
    },
    exitSanctuary: () => {
      if (!get().sanctuaryActive) return;
      set({ sanctuaryActive: false, sanctuaryAutoEntered: false });
      pushWindowState(false);
    },
    toggleSanctuary: () => {
      if (get().sanctuaryActive) {
        get().exitSanctuary();
      } else {
        get().enterSanctuary();
      }
    },
    setSanctuaryVariant: variant => {
      set({ sanctuaryVariant: coerceVariant(variant) });
    },
    setSanctuaryClockFace: face => {
      set({ sanctuaryClockFace: coerceClockFace(face) });
    },
    setSanctuaryClockFormat: format => {
      set({ sanctuaryClockFormat: coerceClockFormat(format) });
    },
    setSanctuaryClockSeconds: enabled => {
      set({ sanctuaryClockSeconds: enabled });
    },
    setSanctuaryAutoEnter: enabled => {
      set({ sanctuaryAutoEnter: enabled });
    },
    setSanctuaryAutoEnterMinutes: minutes => {
      set({ sanctuaryAutoEnterMinutes: coerceAutoEnterMinutes(minutes) });
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedSanctuaryState => ({
      sanctuaryVariant: s.sanctuaryVariant,
      sanctuaryClockFace: s.sanctuaryClockFace,
      sanctuaryClockFormat: s.sanctuaryClockFormat,
      sanctuaryClockSeconds: s.sanctuaryClockSeconds,
      sanctuaryAutoEnter: s.sanctuaryAutoEnter,
      sanctuaryAutoEnterMinutes: s.sanctuaryAutoEnterMinutes,
    }),
    sanitize: (persisted, current) => {
      const p = persisted as Partial<PersistedSanctuaryState> | undefined;
      return {
        ...current,
        sanctuaryVariant: coerceVariant(p?.sanctuaryVariant),
        sanctuaryClockFace: coerceClockFace(p?.sanctuaryClockFace),
        sanctuaryClockFormat: coerceClockFormat(p?.sanctuaryClockFormat),
        sanctuaryClockSeconds:
          typeof p?.sanctuaryClockSeconds === 'boolean' ? p.sanctuaryClockSeconds : false,
        sanctuaryAutoEnter:
          typeof p?.sanctuaryAutoEnter === 'boolean' ? p.sanctuaryAutoEnter : false,
        sanctuaryAutoEnterMinutes: coerceAutoEnterMinutes(p?.sanctuaryAutoEnterMinutes),
      };
    },
  }
);

acceptStoreHmr(useSanctuaryStore, import.meta.hot);
