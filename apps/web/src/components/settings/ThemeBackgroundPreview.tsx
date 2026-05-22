import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { useThemeStore } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';

/**
 * Contained sample of the live theme background, scaled into a settings tile.
 *
 * The whole-app `ThemeBackground` layer deliberately consumes opacity/blur/dim
 * as document-root CSS variables (and uses a no-op store selector) so dragging a
 * slider never re-renders that full-bleed layer. But the Settings glass panel
 * sits on top of most of the canvas, so the user can't honestly judge the effect
 * there. This tile reproduces the exact same image + scrim + dim stack the app
 * paints, but applies the slider values as *locally-scoped* inline styles — it
 * subscribes to the store directly (cheap; it's one small box) and never touches
 * the document root, so the heavy full-app layer is left completely untouched.
 *
 * Mirrors `.theme-bg-image` / `.theme-bg-scrim` (globals.css) for fidelity and
 * resolves the WebP the same document-relative way as `ThemeBackground`.
 */
export function ThemeBackgroundPreview() {
  const { t } = useTranslation('settings');
  const theme = useThemeStore(s => s.theme);
  const bgOpacity = useThemeBgStore(s => s.bgOpacity);
  const bgBlur = useThemeBgStore(s => s.bgBlur);
  const bgDim = useThemeBgStore(s => s.bgDim);

  if (theme === 'none') return null;

  return (
    <div className="relative h-[148px] overflow-hidden rounded-xl border border-border/30 bg-background">
      {/* Image — same class + url() resolution as the real ThemeBackground, but
          opacity/blur are scoped here instead of via the document root vars. */}
      <div
        className="theme-bg-image absolute inset-0"
        style={{
          backgroundImage: `url(./themes/${theme}.webp)`,
          opacity: bgOpacity,
          filter: `blur(${bgBlur}px)`,
        }}
        aria-hidden="true"
      />
      <div className="theme-bg-scrim absolute inset-0" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-background"
        style={{ opacity: bgDim }}
        aria-hidden="true"
      />

      {/* Mock foreground chrome so contrast against the adjusted bg is visible —
          a glass card with a faux track row, the same surface text reads over. */}
      <div className="absolute inset-0 flex items-end p-3">
        <div className="flex w-full items-center gap-2.5 rounded-lg glass border border-border/30 px-2.5 py-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/20 text-primary">
            <Play className="size-3.5 fill-current" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">
              {t('app.bgAdjust.previewTrack')}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {t('app.bgAdjust.previewArtist')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
