import type { ThemeId } from '@/stores/useThemeStore';

export interface IThemeBackgroundView {
  /** Active theme id. `'none'` renders nothing (zero image bytes). */
  readonly theme: ThemeId;
  /**
   * False for `'none'`, and for `'custom'` while no image resolves — a record
   * being healed, or the loopback origin not yet reported.
   */
  readonly hasThemeImage: boolean;
  /**
   * The image to paint: `./themes/<id>.webp` for a bundled theme, a loopback
   * URL for an imported one. Empty string when `hasThemeImage` is false.
   */
  readonly imageUrl: string;
  /**
   * Whether an animated import is showing its poster still instead of itself,
   * because reduced-motion or low-performance mode is on. Always false for a
   * bundled theme. Exposed so a story and a test can assert the freeze without
   * reaching into URL strings.
   */
  readonly isFrozen?: boolean;
}
