import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';

export type LyricsFontSize = 'sm' | 'base' | 'lg' | 'xl';
/** How synced lyrics are presented: the classic list, or the depth-of-field focus stage. */
export type LyricsPresentation = 'list' | 'focus';

export const LYRICS_PLAIN_OPACITY_MIN = 0.5;
export const LYRICS_PLAIN_OPACITY_MAX = 1.0;
export const LYRICS_PLAIN_OPACITY_STEP = 0.05;
export const LYRICS_PLAIN_OPACITY_DEFAULT = 0.9;
export const LYRICS_PLAIN_FONT_SIZE_DEFAULT: LyricsFontSize = 'base';

export const LYRICS_SYNCED_DIM_OPACITY_MIN = 0.2;
export const LYRICS_SYNCED_DIM_OPACITY_MAX = 1.0;
export const LYRICS_SYNCED_DIM_OPACITY_STEP = 0.05;
export const LYRICS_SYNCED_DIM_OPACITY_DEFAULT = 0.45;
export const LYRICS_SYNCED_FONT_SIZE_DEFAULT: LyricsFontSize = 'base';
export const LYRICS_PRESENTATION_DEFAULT: LyricsPresentation = 'list';

/**
 * Original synced view used past=0.25 / idle=0.45. We preserve that ratio
 * (≈ 0.5556) so when the user dims idle, past dims proportionally and stays
 * visibly fainter than idle.
 */
export const LYRICS_SYNCED_PAST_RATIO = 0.25 / 0.45;

export const LYR_SIZE_CLASS: Record<LyricsFontSize, string> = {
  sm: 'text-sm leading-6',
  base: 'text-base leading-7',
  lg: 'text-lg leading-8',
  xl: 'text-xl leading-9',
};

const FONT_SIZE_ORDER: LyricsFontSize[] = ['sm', 'base', 'lg', 'xl'];

/**
 * Active synced line uses one step larger than the user-selected base, capped
 * at xl. Mirrors the original hardcoded "base→lg active" behavior.
 */
export function nextLyricsFontSize(size: LyricsFontSize): LyricsFontSize {
  const idx = FONT_SIZE_ORDER.indexOf(size);
  if (idx < 0) return 'lg';
  return FONT_SIZE_ORDER[Math.min(idx + 1, FONT_SIZE_ORDER.length - 1)];
}

const STORE_KEY = 'shiranami.lyrics-appearance-store';
const LEGACY_APP_STORE_KEY = 'shiranami.app-store';

function clampLyricsPlainOpacity(v: number): number {
  const clamped = Math.min(LYRICS_PLAIN_OPACITY_MAX, Math.max(LYRICS_PLAIN_OPACITY_MIN, v));
  // Round to nearest step to keep persisted values clean.
  const steps = Math.round(clamped / LYRICS_PLAIN_OPACITY_STEP);
  return Math.round(steps * LYRICS_PLAIN_OPACITY_STEP * 1000) / 1000;
}
function coerceLyricsPlainOpacity(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(parsed)) return LYRICS_PLAIN_OPACITY_DEFAULT;
  return clampLyricsPlainOpacity(parsed);
}
function coerceLyricsPlainFontSize(v: unknown): LyricsFontSize {
  return v === 'sm' || v === 'base' || v === 'lg' || v === 'xl'
    ? v
    : LYRICS_PLAIN_FONT_SIZE_DEFAULT;
}
function clampLyricsSyncedDimOpacity(v: number): number {
  const clamped = Math.min(
    LYRICS_SYNCED_DIM_OPACITY_MAX,
    Math.max(LYRICS_SYNCED_DIM_OPACITY_MIN, v)
  );
  const steps = Math.round(clamped / LYRICS_SYNCED_DIM_OPACITY_STEP);
  return Math.round(steps * LYRICS_SYNCED_DIM_OPACITY_STEP * 1000) / 1000;
}
function coerceLyricsSyncedDimOpacity(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(parsed)) return LYRICS_SYNCED_DIM_OPACITY_DEFAULT;
  return clampLyricsSyncedDimOpacity(parsed);
}
function coerceLyricsSyncedFontSize(v: unknown): LyricsFontSize {
  return v === 'sm' || v === 'base' || v === 'lg' || v === 'xl'
    ? v
    : LYRICS_SYNCED_FONT_SIZE_DEFAULT;
}
function coerceLyricsPresentation(v: unknown): LyricsPresentation {
  return v === 'list' || v === 'focus' ? v : LYRICS_PRESENTATION_DEFAULT;
}

interface PersistedLyricsAppearanceState {
  lyricsPlainOpacity: number;
  lyricsPlainFontSize: LyricsFontSize;
  lyricsSyncedDimOpacity: number;
  lyricsSyncedFontSize: LyricsFontSize;
  lyricsPresentation: LyricsPresentation;
}

function sanitize(
  persisted: Partial<PersistedLyricsAppearanceState> | undefined
): Partial<PersistedLyricsAppearanceState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedLyricsAppearanceState> = {};
  if (persisted.lyricsPlainOpacity !== undefined)
    out.lyricsPlainOpacity = coerceLyricsPlainOpacity(persisted.lyricsPlainOpacity);
  if (persisted.lyricsPlainFontSize !== undefined)
    out.lyricsPlainFontSize = coerceLyricsPlainFontSize(persisted.lyricsPlainFontSize);
  if (persisted.lyricsSyncedDimOpacity !== undefined)
    out.lyricsSyncedDimOpacity = coerceLyricsSyncedDimOpacity(persisted.lyricsSyncedDimOpacity);
  if (persisted.lyricsSyncedFontSize !== undefined)
    out.lyricsSyncedFontSize = coerceLyricsSyncedFontSize(persisted.lyricsSyncedFontSize);
  if (persisted.lyricsPresentation !== undefined)
    out.lyricsPresentation = coerceLyricsPresentation(persisted.lyricsPresentation);
  return out;
}

/**
 * One-shot import from the pre-split combined `shiranami.app-store` key.
 * Lyrics appearance state used to live in that bucket; on first load we
 * pull the relevant fields into our own bucket so existing users don't
 * lose their saved preferences. Subsequent loads find our bucket
 * populated and skip. The legacy bucket is left intact so its other
 * (UI/compact) consumers can do the same migration independently.
 */
function importFromLegacyAppStore() {
  if (typeof window === 'undefined') return;
  const ls = window.localStorage;
  if (ls.getItem(STORE_KEY)) return;
  const raw = ls.getItem(LEGACY_APP_STORE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as { state?: Partial<PersistedLyricsAppearanceState> };
    const state = sanitize(parsed.state);
    if (Object.keys(state).length === 0) return;
    ls.setItem(STORE_KEY, JSON.stringify({ state, version: 1 }));
  } catch {
    /* malformed legacy bucket — let the new store start empty */
  }
}

importFromLegacyAppStore();

interface LyricsAppearanceState {
  lyricsPlainOpacity: number;
  lyricsPlainFontSize: LyricsFontSize;
  lyricsSyncedDimOpacity: number;
  lyricsSyncedFontSize: LyricsFontSize;
  lyricsPresentation: LyricsPresentation;
}

interface LyricsAppearanceActions {
  setLyricsPlainOpacity: (value: number) => void;
  setLyricsPlainFontSize: (size: LyricsFontSize) => void;
  resetLyricsPlainAppearance: () => void;
  setLyricsSyncedDimOpacity: (value: number) => void;
  setLyricsSyncedFontSize: (size: LyricsFontSize) => void;
  setLyricsPresentation: (presentation: LyricsPresentation) => void;
  resetLyricsAppearance: () => void;
}

export const useLyricsAppearanceStore = createPersistedStore<
  LyricsAppearanceState & LyricsAppearanceActions
>(
  set => ({
    lyricsPlainOpacity: LYRICS_PLAIN_OPACITY_DEFAULT,
    lyricsPlainFontSize: LYRICS_PLAIN_FONT_SIZE_DEFAULT,
    lyricsSyncedDimOpacity: LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
    lyricsSyncedFontSize: LYRICS_SYNCED_FONT_SIZE_DEFAULT,
    lyricsPresentation: LYRICS_PRESENTATION_DEFAULT,

    setLyricsPlainOpacity: value => {
      set({ lyricsPlainOpacity: coerceLyricsPlainOpacity(value) });
    },
    setLyricsPlainFontSize: size => {
      set({ lyricsPlainFontSize: coerceLyricsPlainFontSize(size) });
    },
    resetLyricsPlainAppearance: () => {
      set({
        lyricsPlainOpacity: LYRICS_PLAIN_OPACITY_DEFAULT,
        lyricsPlainFontSize: LYRICS_PLAIN_FONT_SIZE_DEFAULT,
      });
    },
    setLyricsSyncedDimOpacity: value => {
      set({ lyricsSyncedDimOpacity: coerceLyricsSyncedDimOpacity(value) });
    },
    setLyricsSyncedFontSize: size => {
      set({ lyricsSyncedFontSize: coerceLyricsSyncedFontSize(size) });
    },
    setLyricsPresentation: presentation => {
      set({ lyricsPresentation: coerceLyricsPresentation(presentation) });
    },
    resetLyricsAppearance: () => {
      set({
        lyricsPlainOpacity: LYRICS_PLAIN_OPACITY_DEFAULT,
        lyricsPlainFontSize: LYRICS_PLAIN_FONT_SIZE_DEFAULT,
        lyricsSyncedDimOpacity: LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
        lyricsSyncedFontSize: LYRICS_SYNCED_FONT_SIZE_DEFAULT,
        lyricsPresentation: LYRICS_PRESENTATION_DEFAULT,
      });
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedLyricsAppearanceState => ({
      lyricsPlainOpacity: s.lyricsPlainOpacity,
      lyricsPlainFontSize: s.lyricsPlainFontSize,
      lyricsSyncedDimOpacity: s.lyricsSyncedDimOpacity,
      lyricsSyncedFontSize: s.lyricsSyncedFontSize,
      lyricsPresentation: s.lyricsPresentation,
    }),
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedLyricsAppearanceState>),
    }),
  }
);

acceptStoreHmr(useLyricsAppearanceStore, import.meta.hot);
