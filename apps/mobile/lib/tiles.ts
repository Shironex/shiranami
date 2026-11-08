import generated from '@/theme/colors.json';

export type TileHue = keyof typeof generated.tiles;

/** The hues a kanji tile can take, generated from theme/palette.js. */
export const TILE_HUES = Object.keys(generated.tiles) as TileHue[];

/** Fill and glyph color of a kanji tile. */
export function tileColors(hue: TileHue): { bg: string; fg: string } {
  return generated.tiles[hue];
}
