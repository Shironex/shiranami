import { useThemeStore } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';

/**
 * Full-bleed theme image + contrast scrim painted at z-0, beneath the ambient
 * album glow and all shell chrome. Renders nothing for the "none" theme so the
 * default ships zero image bytes and the bare --background shows through.
 *
 * The image URL is set inline (document-relative `./themes/<id>.webp`) rather
 * than via the CSS `var(--theme-bg)` so it resolves against dist/index.html
 * (Vite base './'), exactly like the Appearance picker's `<img src>`. The CSS
 * approach 404'd in packaged builds: the stylesheet lives at dist/assets/, so a
 * relative `./themes/` there resolved to dist/assets/themes/ (nonexistent).
 *
 * The scrim ships in the same component as the image (never after) so no theme
 * can ever render un-scrimmed — it is the WCAG floor that keeps light
 * foreground text legible over the bright themes (summer/sunset). Both the
 * image and the scrim are deliberately retained under low-perf and
 * prefers-reduced-transparency: the image is a single static bitmap with no
 * animation or blur, so it carries the theme identity at near-zero cost.
 */
export function ThemeBackground() {
  const theme = useThemeStore(s => s.theme);
  // Importing the store here triggers its onRehydrate, which applies
  // --theme-bg-opacity / --theme-bg-blur / --theme-bg-dim to the DOM.
  useThemeBgStore();
  if (theme === 'none') return null;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div
        className="theme-bg-image absolute inset-0"
        style={{ backgroundImage: `url(./themes/${theme}.webp)` }}
      />
      <div className="theme-bg-scrim absolute inset-0" />
      <div
        className="absolute inset-0 bg-background"
        style={{ opacity: 'var(--theme-bg-dim, 0)' }}
      />
    </div>
  );
}
