import { useThemeStore } from '@/stores/useThemeStore';

/**
 * Full-bleed theme image + contrast scrim painted at z-0, beneath the ambient
 * album glow and all shell chrome. Renders nothing for the "none" theme so the
 * default ships zero image bytes and the bare --background shows through.
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
  if (theme === 'none') return null;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <div className="theme-bg-image absolute inset-0" />
      <div className="theme-bg-scrim absolute inset-0" />
    </div>
  );
}
