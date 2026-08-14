import { useThemeStore, CUSTOM_THEME } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';
import { useDecorativeMotion } from '@/hooks/useDecorativeMotion';
import { backgroundUrls, useCustomBackgroundQuery } from '@/hooks/queries/useCustomBackground';
import type { IThemeBackgroundView } from './ThemeBackground.types';

/**
 * Owns the theme-background state. Resolves the active theme and its image URL.
 *
 * Bundled themes keep the inline `./themes/<id>.webp` form (document-relative so
 * it resolves against dist/index.html under Vite base './', exactly like the
 * Appearance picker). `custom` instead names a file the shell copied into app
 * data, served over the loopback origin — the webview has no filesystem reach,
 * so this is the same road album art travels.
 *
 * # Freezing is a URL swap, and that is the whole design
 *
 * An animated wallpaper breaks the premise that keeps this layer alive under
 * `lowPerformanceMode` (see the component doc: "a single static bitmap with no
 * animation or blur"). The freeze is resolved *here*, by choosing the poster
 * still the importer already encoded, so the painted markup never learns that
 * animation exists: no `<img>`, no `<video>`, no canvas, no second branch in
 * the layer that would have to keep the scrim in the right place twice.
 *
 * A GIF with no still — a record written before the importer encoded them —
 * falls back to the animated file rather than to nothing. Showing the user's
 * wallpaper when we cannot freeze it is the lesser of the two wrongs against a
 * background that simply disappears when they enable low-performance mode.
 */
export function useThemeBackground(): IThemeBackgroundView {
  const theme = useThemeStore(s => s.theme);
  // No-op selector: keep the store import alive (so its onRehydrate applies
  // --theme-bg-opacity / --theme-bg-blur / --theme-bg-dim / --theme-bg-fit to
  // the DOM) WITHOUT subscribing this full-bleed layer to state. The values are
  // consumed purely as CSS variables, so re-rendering on every slider tick
  // would be wasted work.
  useThemeBgStore(() => null);

  // These two do re-render the layer, and are meant to: one changes when the
  // user imports or clears an image, the other when they toggle a motion
  // preference. Neither fires during a drag.
  const { data: record } = useCustomBackgroundQuery();
  const motionAllowed = useDecorativeMotion();

  if (theme !== CUSTOM_THEME) {
    return { theme, hasThemeImage: theme !== 'none', imageUrl: `./themes/${theme}.webp` };
  }

  const { url, stillUrl } = backgroundUrls(record);
  const frozen = !motionAllowed && record?.animated === true && stillUrl !== null;
  const resolved = frozen ? stillUrl : url;

  return {
    theme,
    // Unlike a bundled theme, `custom` can be selected while its image is
    // missing — the record is healing, or the loopback origin has not answered
    // yet. Painting the scrim over nothing is worse than painting nothing.
    hasThemeImage: resolved !== null,
    imageUrl: resolved ?? '',
    isFrozen: frozen,
  };
}
