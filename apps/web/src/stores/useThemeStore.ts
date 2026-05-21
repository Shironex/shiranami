import { createPersistedStore, coerceEnum, acceptStoreHmr } from '@/lib/createPersistedStore';

export type ThemeId = 'none' | 'lofi-night' | 'snow' | 'summer' | 'sunset' | 'wisteria';

export const THEME_IDS: readonly ThemeId[] = [
  'none',
  'lofi-night',
  'snow',
  'summer',
  'sunset',
  'wisteria',
] as const;

/** None/Solid: byte-identical to today, no data-theme attribute, zero image bytes. */
export const DEFAULT_THEME: ThemeId = 'none';

const STORE_KEY = 'shiranami.theme';

function coerceTheme(v: unknown): ThemeId {
  return coerceEnum(v, THEME_IDS, DEFAULT_THEME);
}

/** Side-effect — mirrors applyLowPerformanceMode in useUIStore exactly. */
export function applyTheme(theme: ThemeId) {
  if (typeof document === 'undefined') return;
  if (theme === DEFAULT_THEME) {
    delete document.documentElement.dataset.theme; // bare :root == today
  } else {
    document.documentElement.dataset.theme = theme; // -> <html data-theme="snow">
  }
}

interface ThemeState {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

export const useThemeStore = createPersistedStore<ThemeState>(
  set => ({
    theme: DEFAULT_THEME,
    setTheme: t => {
      const next = coerceTheme(t);
      applyTheme(next);
      set({ theme: next });
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: s => ({ theme: s.theme }),
    sanitize: (persisted, current) => ({
      ...current,
      theme: coerceTheme((persisted as Partial<ThemeState> | undefined)?.theme),
    }),
    onRehydrate: state => applyTheme(state.theme), // re-apply on rehydrate, exactly like applyUiScale
  }
);

acceptStoreHmr(useThemeStore, import.meta.hot, state => applyTheme(coerceTheme(state.theme)));
