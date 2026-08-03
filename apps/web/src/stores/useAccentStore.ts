import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';
import { hexToRgb, isHexColor, prefersDarkInk } from '@/lib/color';

/**
 * Preset accent swatches. The first five mirror the per-theme accents in
 * globals.css (violet = :root, periwinkle = snow, sky = summer, peach =
 * sunset, lavender = wisteria) so a familiar palette is one click away; the
 * rest fill out the lofi-pastel range. `nameKey` indexes
 * settings:app.accent.names.* for the a11y label.
 */
export const ACCENT_PRESETS: ReadonlyArray<{ hex: string; nameKey: string }> = [
  { hex: '#9b7deb', nameKey: 'violet' },
  { hex: '#8aaaeb', nameKey: 'periwinkle' },
  { hex: '#60b8e0', nameKey: 'sky' },
  { hex: '#6ee7b7', nameKey: 'mint' },
  { hex: '#a3cc8f', nameKey: 'matcha' },
  { hex: '#fcd34d', nameKey: 'gold' },
  { hex: '#f09e60', nameKey: 'peach' },
  { hex: '#f08080', nameKey: 'coral' },
  { hex: '#ef7bae', nameKey: 'rose' },
  { hex: '#cd8ee6', nameKey: 'lavender' },
];

/** null = follow the theme's accent (no override). */
export const ACCENT_DEFAULT = null;

const STORE_KEY = 'shiranami.accent-store';

// Foreground candidates for text rendered on the accent. Values mirror
// --primary-foreground (:root) and --foreground so overridden accents keep
// the same ink colors the rest of the palette uses; the WCAG pick between
// them is `prefersDarkInk` (lib/color), shared with the art-palette ink.
const DARK_FOREGROUND = 'oklch(0.1 0.02 280)';
const LIGHT_FOREGROUND = 'oklch(0.97 0.01 280)';

const ACCENT_PROPS = ['--primary', '--primary-rgb', '--primary-foreground', '--ring'] as const;

function coerceAccent(v: unknown): string | null {
  return isHexColor(v) ? v.toLowerCase() : ACCENT_DEFAULT;
}

/**
 * Side-effect — inline styles on <html> beat both :root and [data-theme]
 * blocks, so a custom accent overrides whatever theme is active; clearing
 * them falls straight back to the theme's own accent. --primary-rgb must be
 * kept in lockstep because canvas visualizers and inline glows read the raw
 * triplet instead of the resolved color.
 */
export function applyAccent(accentColor: string | null): void {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  const rgb = accentColor ? hexToRgb(accentColor) : null;
  if (!rgb) {
    for (const prop of ACCENT_PROPS) style.removeProperty(prop);
    return;
  }
  const foreground = prefersDarkInk(rgb) ? DARK_FOREGROUND : LIGHT_FOREGROUND;
  style.setProperty('--primary', accentColor);
  style.setProperty('--primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  style.setProperty('--primary-foreground', foreground);
  style.setProperty('--ring', accentColor);
}

interface AccentState {
  /** #rrggbb override, or null to follow the active theme's accent. */
  accentColor: string | null;
  /**
   * "Follow the record": derive the accent from the playing cover's palette.
   * The actual application lives in AmbientColorProvider (it owns the
   * palette); picking a manual accent or resetting turns this back off so
   * the user's explicit choice always wins.
   */
  followArtAccent: boolean;
  setAccentColor: (hex: string | null) => void;
  setFollowArtAccent: (enabled: boolean) => void;
  resetAccent: () => void;
}

export const useAccentStore = createPersistedStore<AccentState>(
  set => ({
    accentColor: ACCENT_DEFAULT,
    followArtAccent: false,
    setAccentColor: hex => {
      const next = coerceAccent(hex);
      applyAccent(next);
      set({ accentColor: next, followArtAccent: false });
    },
    setFollowArtAccent: enabled => {
      set({ followArtAccent: enabled });
    },
    resetAccent: () => {
      applyAccent(ACCENT_DEFAULT);
      set({ accentColor: ACCENT_DEFAULT, followArtAccent: false });
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: s => ({ accentColor: s.accentColor, followArtAccent: s.followArtAccent }),
    sanitize: (persisted, current) => {
      const p = persisted as Partial<AccentState> | undefined;
      return {
        ...current,
        accentColor: coerceAccent(p?.accentColor),
        followArtAccent: typeof p?.followArtAccent === 'boolean' ? p.followArtAccent : false,
      };
    },
    onRehydrate: state => applyAccent(state.accentColor),
  }
);

acceptStoreHmr(useAccentStore, import.meta.hot, state =>
  applyAccent(coerceAccent(state.accentColor))
);
