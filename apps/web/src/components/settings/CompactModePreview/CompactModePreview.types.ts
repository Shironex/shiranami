export interface ICompactModePreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Localized disclaimer shown under the mock card. */
  readonly disclaimer: string;
  /** Localized mock track title. */
  readonly trackTitle: string;
  /** Localized mock artist. */
  readonly artist: string;
  /** Localized mock album. */
  readonly album: string;

  // --- Derived sizing (from the chosen compact size + font size) ---
  /** Mock card width in pixels. */
  readonly cardWidth: number;
  /** Title text size class for the chosen font size. */
  readonly titleClass: string;
  /** Artist text size class for the chosen font size. */
  readonly artistClass: string;
  /** Album text size class for the chosen font size. */
  readonly albumClass: string;
  /** Album-art square size in pixels. */
  readonly artSize: number;
  /** Album-art glyph size in pixels. */
  readonly artIconSize: number;
  /** Padding class for the mock card. */
  readonly padding: string;
  /** Control-icon size in pixels. */
  readonly controlSize: number;

  // --- Element visibility (from the compact store) ---
  /** Whether the album-art thumbnail is shown. */
  readonly showAlbumArt: boolean;
  /** Whether the album line is shown. */
  readonly showAlbum: boolean;
  /** Whether the seek row is shown. */
  readonly showSeek: boolean;
  /** Whether the volume control is shown. */
  readonly showVolume: boolean;
  /** Whether the favorite glyph is shown. */
  readonly showFavorite: boolean;
  /** Whether the lyrics glyph is shown. */
  readonly showLyrics: boolean;
  /** Whether either the favorite or lyrics glyph is shown (cluster gate). */
  readonly showGlyphCluster: boolean;
}
