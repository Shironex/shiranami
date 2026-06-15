import type { ThemeId } from '@/stores/useThemeStore';

export interface IThemeBackgroundPreviewView {
  /** Active theme id; `'none'` hides the preview entirely. */
  readonly theme: ThemeId;
  /** Whether a background image is active (theme is not `'none'`). */
  readonly hasBackground: boolean;
  /** Resolved `url(...)` value for the active theme's WebP image. */
  readonly backgroundImage: string;
  /** Live image opacity (0–1) from the background-adjust slider. */
  readonly bgOpacity: number;
  /** Live `blur(...)` filter value (e.g. `"6px"`) from the slider. */
  readonly blurFilter: string;
  /** Live dim-overlay opacity (0–1) from the slider. */
  readonly bgDim: number;
  /** Localized sample track title shown over the preview background. */
  readonly previewTrack: string;
  /** Localized sample artist line shown over the preview background. */
  readonly previewArtist: string;
}
