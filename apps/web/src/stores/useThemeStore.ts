import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
  return (THEME_IDS as readonly string[]).includes(v as string) ? (v as ThemeId) : DEFAULT_THEME;
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

export const useThemeStore = create<ThemeState>()(
  persist(
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
      storage: createJSONStorage(() => localStorage),
      partialize: s => ({ theme: s.theme }),
      merge: (persisted, current) => ({
        ...current,
        theme: coerceTheme((persisted as Partial<ThemeState> | undefined)?.theme),
      }),
      onRehydrateStorage: () => state => {
        if (!state) return;
        applyTheme(state.theme); // re-apply on rehydrate, exactly like applyUiScale
      },
    }
  )
);

if (import.meta.hot) {
  type HmrData = { store?: typeof useThemeStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useThemeStore.setState(data.store.getState());
  }
  data.store = useThemeStore;
  hot.accept();
}
