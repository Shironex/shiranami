import type { ThemeId } from '@/stores/useThemeStore';

export interface IThemeBackgroundView {
  /** Active theme id. `'none'` renders nothing (zero image bytes). */
  readonly theme: ThemeId;
  /** False for the `'none'` theme — the full-bleed image + scrim are skipped. */
  readonly hasThemeImage: boolean;
  /** Document-relative URL of the committed theme WebP (`./themes/<id>.webp`). */
  readonly imageUrl: string;
}
