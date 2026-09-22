import {
  createPersistedStore,
  clampNumber,
  coerceEnum,
  acceptStoreHmr,
} from '@/lib/createPersistedStore';

/**
 * How the theme image fills the viewport.
 *
 * `cover` is what every bundled theme wants and what the five shipped photos are
 * cropped for. `contain` exists for imported images: a tall phone wallpaper under
 * `cover` is cropped to its middle third with no recourse, which was the single
 * most-felt limitation of the implementation this one is modelled on. The
 * letterbox bars it produces are already handled — `.theme-bg-image` paints
 * `background-color: var(--background)` beneath the image.
 */
export type ThemeBgFit = 'cover' | 'contain';

export const THEME_BG_FITS: readonly ThemeBgFit[] = ['cover', 'contain'] as const;
export const THEME_BG_FIT_DEFAULT: ThemeBgFit = 'cover';

export const THEME_BG_OPACITY_MIN = 0;
export const THEME_BG_OPACITY_MAX = 1;
export const THEME_BG_OPACITY_STEP = 0.01;
export const THEME_BG_OPACITY_DEFAULT = 1.0;

export const THEME_BG_BLUR_MIN = 0;
export const THEME_BG_BLUR_MAX = 20;
export const THEME_BG_BLUR_STEP = 1;
export const THEME_BG_BLUR_DEFAULT = 0;

export const THEME_BG_DIM_MIN = 0;
export const THEME_BG_DIM_MAX = 1;
export const THEME_BG_DIM_STEP = 0.01;
export const THEME_BG_DIM_DEFAULT = 0;

const STORE_KEY = 'shiranami.theme-bg-store';

function applyThemeBgToDOM(opacity: number, blur: number, dim: number, fit: ThemeBgFit): void {
  const root = document.documentElement;
  root.style.setProperty('--theme-bg-opacity', String(opacity));
  root.style.setProperty('--theme-bg-blur', `${blur}px`);
  root.style.setProperty('--theme-bg-dim', String(dim));
  root.style.setProperty('--theme-bg-fit', fit);
}

interface PersistedThemeBgState {
  bgOpacity: number;
  bgBlur: number;
  bgDim: number;
  bgFit: ThemeBgFit;
}

function sanitize(
  persisted: Partial<PersistedThemeBgState> | undefined
): Partial<PersistedThemeBgState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedThemeBgState> = {};
  if (persisted.bgOpacity !== undefined)
    out.bgOpacity = clampNumber(
      persisted.bgOpacity,
      THEME_BG_OPACITY_MIN,
      THEME_BG_OPACITY_MAX,
      THEME_BG_OPACITY_DEFAULT
    );
  if (persisted.bgBlur !== undefined)
    out.bgBlur = clampNumber(
      persisted.bgBlur,
      THEME_BG_BLUR_MIN,
      THEME_BG_BLUR_MAX,
      THEME_BG_BLUR_DEFAULT
    );
  if (persisted.bgDim !== undefined)
    out.bgDim = clampNumber(
      persisted.bgDim,
      THEME_BG_DIM_MIN,
      THEME_BG_DIM_MAX,
      THEME_BG_DIM_DEFAULT
    );
  // Presence-checked like the three above, which is why `bgFit` needs no
  // version bump and no migration: a bucket written before this field existed
  // simply does not carry the key, and the initial state's default stands.
  // Bumping `version` would have been worse than unnecessary —
  // `createPersistedStore` passes no `migrate` to zustand, so a version
  // mismatch yields no migrated state and every user's opacity, blur and dim
  // would silently reset to defaults.
  if (persisted.bgFit !== undefined)
    out.bgFit = coerceEnum(persisted.bgFit, THEME_BG_FITS, THEME_BG_FIT_DEFAULT);
  return out;
}

interface ThemeBgState {
  bgOpacity: number;
  bgBlur: number;
  bgDim: number;
  bgFit: ThemeBgFit;
}

interface ThemeBgActions {
  setBgOpacity: (v: number) => void;
  setBgBlur: (v: number) => void;
  setBgDim: (v: number) => void;
  setBgFit: (v: ThemeBgFit) => void;
  resetBg: () => void;
}

/**
 * Push the whole tuple to the DOM from current state.
 *
 * The setters below call this instead of assembling the argument list
 * themselves. With three values that was a readable `set` followed by a
 * two-`getState` call; with four it stops being readable, and every setter
 * would have to be edited again the next time one is added.
 */
function applyFromState(): void {
  const { bgOpacity, bgBlur, bgDim, bgFit } = useThemeBgStore.getState();
  applyThemeBgToDOM(bgOpacity, bgBlur, bgDim, bgFit);
}

export const useThemeBgStore = createPersistedStore<ThemeBgState & ThemeBgActions>(
  set => ({
    bgOpacity: THEME_BG_OPACITY_DEFAULT,
    bgBlur: THEME_BG_BLUR_DEFAULT,
    bgDim: THEME_BG_DIM_DEFAULT,
    bgFit: THEME_BG_FIT_DEFAULT,

    setBgOpacity: v => {
      set({
        bgOpacity: clampNumber(
          v,
          THEME_BG_OPACITY_MIN,
          THEME_BG_OPACITY_MAX,
          THEME_BG_OPACITY_DEFAULT
        ),
      });
      applyFromState();
    },
    setBgBlur: v => {
      set({ bgBlur: clampNumber(v, THEME_BG_BLUR_MIN, THEME_BG_BLUR_MAX, THEME_BG_BLUR_DEFAULT) });
      applyFromState();
    },
    setBgDim: v => {
      set({ bgDim: clampNumber(v, THEME_BG_DIM_MIN, THEME_BG_DIM_MAX, THEME_BG_DIM_DEFAULT) });
      applyFromState();
    },
    setBgFit: v => {
      set({ bgFit: coerceEnum(v, THEME_BG_FITS, THEME_BG_FIT_DEFAULT) });
      applyFromState();
    },
    resetBg: () => {
      set({
        bgOpacity: THEME_BG_OPACITY_DEFAULT,
        bgBlur: THEME_BG_BLUR_DEFAULT,
        bgDim: THEME_BG_DIM_DEFAULT,
        bgFit: THEME_BG_FIT_DEFAULT,
      });
      applyFromState();
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedThemeBgState => ({
      bgOpacity: s.bgOpacity,
      bgBlur: s.bgBlur,
      bgDim: s.bgDim,
      bgFit: s.bgFit,
    }),
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedThemeBgState>),
    }),
    onRehydrate: state => {
      applyThemeBgToDOM(state.bgOpacity, state.bgBlur, state.bgDim, state.bgFit);
    },
  }
);

acceptStoreHmr(useThemeBgStore, import.meta.hot);
