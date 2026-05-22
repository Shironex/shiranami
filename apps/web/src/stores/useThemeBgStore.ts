import { createPersistedStore, clampNumber, acceptStoreHmr } from '@/lib/createPersistedStore';

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

function applyThemeBgToDOM(opacity: number, blur: number, dim: number): void {
  const root = document.documentElement;
  root.style.setProperty('--theme-bg-opacity', String(opacity));
  root.style.setProperty('--theme-bg-blur', `${blur}px`);
  root.style.setProperty('--theme-bg-dim', String(dim));
}

interface PersistedThemeBgState {
  bgOpacity: number;
  bgBlur: number;
  bgDim: number;
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
  return out;
}

interface ThemeBgState {
  bgOpacity: number;
  bgBlur: number;
  bgDim: number;
}

interface ThemeBgActions {
  setBgOpacity: (v: number) => void;
  setBgBlur: (v: number) => void;
  setBgDim: (v: number) => void;
  resetBg: () => void;
}

export const useThemeBgStore = createPersistedStore<ThemeBgState & ThemeBgActions>(
  set => ({
    bgOpacity: THEME_BG_OPACITY_DEFAULT,
    bgBlur: THEME_BG_BLUR_DEFAULT,
    bgDim: THEME_BG_DIM_DEFAULT,

    setBgOpacity: v => {
      const next = clampNumber(
        v,
        THEME_BG_OPACITY_MIN,
        THEME_BG_OPACITY_MAX,
        THEME_BG_OPACITY_DEFAULT
      );
      set({ bgOpacity: next });
      applyThemeBgToDOM(next, useThemeBgStore.getState().bgBlur, useThemeBgStore.getState().bgDim);
    },
    setBgBlur: v => {
      const next = clampNumber(v, THEME_BG_BLUR_MIN, THEME_BG_BLUR_MAX, THEME_BG_BLUR_DEFAULT);
      set({ bgBlur: next });
      applyThemeBgToDOM(
        useThemeBgStore.getState().bgOpacity,
        next,
        useThemeBgStore.getState().bgDim
      );
    },
    setBgDim: v => {
      const next = clampNumber(v, THEME_BG_DIM_MIN, THEME_BG_DIM_MAX, THEME_BG_DIM_DEFAULT);
      set({ bgDim: next });
      applyThemeBgToDOM(
        useThemeBgStore.getState().bgOpacity,
        useThemeBgStore.getState().bgBlur,
        next
      );
    },
    resetBg: () => {
      set({
        bgOpacity: THEME_BG_OPACITY_DEFAULT,
        bgBlur: THEME_BG_BLUR_DEFAULT,
        bgDim: THEME_BG_DIM_DEFAULT,
      });
      applyThemeBgToDOM(THEME_BG_OPACITY_DEFAULT, THEME_BG_BLUR_DEFAULT, THEME_BG_DIM_DEFAULT);
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedThemeBgState => ({
      bgOpacity: s.bgOpacity,
      bgBlur: s.bgBlur,
      bgDim: s.bgDim,
    }),
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedThemeBgState>),
    }),
    onRehydrate: state => {
      applyThemeBgToDOM(state.bgOpacity, state.bgBlur, state.bgDim);
    },
  }
);

acceptStoreHmr(useThemeBgStore, import.meta.hot);
