/**
 * Minimal color math for the accent customization feature. The app's palette
 * is authored in oklch, but user-picked accents arrive as #rrggbb from the
 * native color input, and the canvas visualizers consume raw RGB triplets —
 * so hex/RGB is the interchange format here.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** Strict #rrggbb check — the only shape the native color input emits. */
export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_COLOR_RE.test(v);
}

/** Parse #rrggbb into 0-255 channels. Returns null for malformed input. */
export function hexToRgb(hex: string): Rgb | null {
  if (!isHexColor(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0 = black, 1 = white) of 0-255 channels. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two luminances (order-independent). */
export function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
