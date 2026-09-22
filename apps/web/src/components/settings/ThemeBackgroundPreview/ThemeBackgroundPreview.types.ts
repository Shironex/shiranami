import type { ThemeId } from '@/stores/useThemeStore';
import type { ThemeBgFit } from '@/stores/useThemeBgStore';

export interface IThemeBackgroundPreviewView {
  /** Active theme id; `'none'` hides the preview entirely. */
  readonly theme: ThemeId;
  /**
   * Whether a background image is active. False for `'none'`, and for
   * `'custom'` while no image resolves — otherwise the tile would render the
   * scrim over an empty box and read as a broken preview.
   */
  readonly hasBackground: boolean;
  /** Resolved `url(...)` value: the theme's WebP, or the imported image. */
  readonly backgroundImage: string;
  /** Live image opacity (0–1) from the background-adjust slider. */
  readonly bgOpacity: number;
  /** Live `blur(...)` filter value (e.g. `"6px"`) from the slider. */
  readonly blurFilter: string;
  /** Live dim-overlay opacity (0–1) from the slider. */
  readonly bgDim: number;
  /** Live fit mode, so the tile crops the way the real background does. */
  readonly bgFit: ThemeBgFit;
  /** Localized sample track title shown over the preview background. */
  readonly previewTrack: string;
  /** Localized sample artist line shown over the preview background. */
  readonly previewArtist: string;
}
