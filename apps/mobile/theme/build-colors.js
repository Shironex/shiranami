const { oklchToHex } = require('./oklch');
const { palette, TILE_HUES, tile } = require('./palette');

/** The palette as hex, in the shape theme/colors.json stores. */
function buildColors() {
  const colors = Object.fromEntries(
    Object.entries(palette).map(([name, [l, c, h, alpha]]) => [name, oklchToHex(l, c, h, alpha)])
  );
  const tiles = Object.fromEntries(
    TILE_HUES.map(h => [
      String(h),
      { bg: oklchToHex(tile.bg[0], tile.bg[1], h), fg: oklchToHex(tile.fg[0], tile.fg[1], h) },
    ])
  );
  return { colors, tiles };
}

module.exports = { buildColors };
