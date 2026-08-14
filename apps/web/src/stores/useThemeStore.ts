import { createPersistedStore, coerceEnum, acceptStoreHmr } from '@/lib/createPersistedStore';

export type ThemeId = 'none' | 'lofi-night' | 'snow' | 'summer' | 'sunset' | 'wisteria' | 'custom';

export const THEME_IDS: readonly ThemeId[] = [
  'none',
  'lofi-night',
  'snow',
  'summer',
  'sunset',
  'wisteria',
  'custom',
] as const;

/**
 * The theme whose image comes from disk instead of `./themes/<id>.webp`.
 *
 * Modelled as a sixth theme rather than a layer above one, which is what buys
 * the whole feature for the price of a URL: the scrim, the dim layer, the
 * opacity/blur sliders and every `[data-theme]` chrome-contrast rule already
 * apply to it. The cost is that a custom image and a bundled theme are
 * alternatives, not a stack.
 *
 * It is the one theme whose selection can be *invalid*: the record naming the
 * file lives in the settings document, and the file itself can be gone. See
 * `useCustomBackground`, which reconciles the two on first read.
 */
export const CUSTOM_THEME: ThemeId = 'custom';

/** None/Solid: byte-identical to today, no data-theme attribute, zero image bytes. */
export const DEFAULT_THEME: ThemeId = 'none';

const STORE_KEY = 'shiranami.theme';

function coerceTheme(v: unknown): ThemeId {
  return coerceEnum(v, THEME_IDS, DEFAULT_THEME);
}

/**
 * Side-effect — mirrors applyLowPerformanceMode in useUIStore exactly, with one
 * exception.
 *
 * `custom` does **not** get its attribute here, and `confirmed` is how it
 * eventually does. Every other theme's image is a bundled asset that certainly
 * exists, so writing `data-theme` immediately is free. `custom` names a file on
 * disk that this store cannot see, and the attribute is not decoration: it
 * switches on the translucent topbar, sidebar and hero surfaces, plus a heavier
 * scrim, all of which assume a photo is behind them. Setting it before the
 * record is confirmed paints that chrome over a bare `--background` — briefly on
 * every launch, and permanently when the file turns out to be gone.
 *
 * `theme-init.ts` makes the same refusal pre-paint. This is the other half: the
 * store's own rehydrate runs synchronously at module evaluation and would
 * otherwise undo it a line later. `useReconcileCustomTheme` calls this with
 * `confirmed` once the backend answers.
 */
export function applyTheme(theme: ThemeId, confirmed = false): void {
  if (typeof document === 'undefined') return;
  if (theme === DEFAULT_THEME || (theme === CUSTOM_THEME && !confirmed)) {
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
