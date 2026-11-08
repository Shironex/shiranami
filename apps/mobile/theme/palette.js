/**
 * The one source of the app's colors: the desktop Midnight Lofi Cafe tokens
 * (apps/web/src/styles/globals.css) as OKLCH [l, c, h, alpha?]. Run
 * `pnpm tokens` after editing; it writes theme/colors.json, which Tailwind and
 * the TypeScript theme both read.
 */

const HUE = 280;

/** Primary mixed over transparent at a given strength, like CSS color-mix. */
const primaryAt = alpha => [0.72, 0.12, HUE, alpha];

const palette = {
  background: [0.08, 0.02, HUE],
  surface: [0.1, 0.015, HUE],
  card: [0.12, 0.02, HUE],
  muted: [0.15, 0.02, HUE],
  raised: [0.155, 0.022, HUE],
  nav: [0.115, 0.02, HUE],
  mini: [0.17, 0.028, HUE],
  sheet: [0.135, 0.022, HUE],
  'player-glow': [0.2, 0.045, HUE],
  'player-mid': [0.11, 0.025, HUE],
  /** Launcher icon and splash disk behind the mascot (app.json repeats the hex). */
  icon: [0.25, 0.07, HUE],
  foreground: [0.93, 0.01, HUE],
  'soft-foreground': [0.86, 0.015, HUE],
  'muted-foreground': [0.7, 0.02, HUE],
  primary: [0.72, 0.12, HUE],
  'primary-foreground': [0.1, 0.02, HUE],
  'primary-tint': primaryAt(0.09),
  'primary-tonal': primaryAt(0.16),
  'primary-chip': primaryAt(0.2),
  'primary-pill': primaryAt(0.26),
  'primary-ring': primaryAt(0.4),
  border: [1, 0, 0, 0.06],
  'border-strong': [1, 0, 0, 0.18],
  rail: [1, 0, 0, 0.16],
  handle: [1, 0, 0, 0.28],
  /** Base of photo scrims; the gradient stops add their own opacity. */
  shade: [0.05, 0.02, HUE],
  veil: [0.03, 0.015, HUE, 0.6],
  favorite: [0.7, 0.18, 15],
  live: [0.7, 0.18, 25],
  'switch-track': [0.32, 0.02, HUE],
  destructive: [0.7, 0.18, 25],
};

/**
 * Kanji tile pairs, one per hue: a deep fill and a pale glyph (about 9:1).
 * Hues come from the desktop theme accents plus a few in between.
 */
const TILE_HUES = [15, 45, 80, 160, 190, 220, 250, 280, 315, 345];
const tile = { bg: [0.27, 0.05], fg: [0.88, 0.045] };

module.exports = { palette, TILE_HUES, tile };
