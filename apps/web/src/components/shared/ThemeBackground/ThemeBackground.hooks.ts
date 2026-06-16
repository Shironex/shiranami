import { useThemeStore } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';
import type { IThemeBackgroundView } from './ThemeBackground.types';

/**
 * Owns the theme-background state. Resolves the active theme and the inline
 * `./themes/<id>.webp` URL (document-relative so it resolves against
 * dist/index.html under Vite base './', exactly like the Appearance picker).
 */
export function useThemeBackground(): IThemeBackgroundView {
  const theme = useThemeStore(s => s.theme);
  // No-op selector: keep the store import alive (so its onRehydrate applies
  // --theme-bg-opacity / --theme-bg-blur / --theme-bg-dim to the DOM) WITHOUT
  // subscribing this full-bleed layer to state. The values are consumed purely
  // as CSS variables, so re-rendering on every slider tick would be wasted work.
  useThemeBgStore(() => null);

  return {
    theme,
    hasThemeImage: theme !== 'none',
    imageUrl: `./themes/${theme}.webp`,
  };
}
