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

// ── OKLCH ──────────────────────────────────────────────────────────────────
//
// Album covers hand us arbitrary colors; the app's palette is authored in
// oklch. Converting into OKLCH lets a wild cover color be *clamped into
// calm* (cap chroma, pin lightness) and lets two accents tween hue-to-hue
// without crossing through gray — both of which sRGB math gets wrong.
// Matrices are Björn Ottosson's reference OKLab implementation.

export interface Oklch {
  /** Perceptual lightness, 0-1. */
  l: number;
  /** Chroma (0 = gray; sRGB accents top out around 0.3). */
  c: number;
  /** Hue angle in degrees, [0, 360). */
  h: number;
}

function delinearize(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/** sRGB (0-255 channels) → OKLCH. */
export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.hypot(okA, okB);
  const h = ((Math.atan2(okB, okA) * 180) / Math.PI + 360) % 360;
  return { l: okL, c, h };
}

/**
 * OKLCH → sRGB (0-255 channels). Out-of-gamut inputs walk their chroma down
 * until every channel fits, so a heavily-saturated request degrades toward
 * the same hue at printable saturation instead of clipping toward a wrong one.
 */
export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  for (let chroma = c; ; chroma = Math.max(0, chroma - 0.01)) {
    const rgb = rawOklchToRgb(l, chroma, h);
    if (rgb || chroma === 0) {
      return rgb ?? { r: 0, g: 0, b: 0 };
    }
  }
}

/** One gamut attempt: null when any linear channel escapes [0, 1]. */
function rawOklchToRgb(l: number, c: number, h: number): Rgb | null {
  const hr = (h * Math.PI) / 180;
  const okA = c * Math.cos(hr);
  const okB = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * okA + 0.2158037573 * okB;
  const m_ = l - 0.1055613458 * okA - 0.0638541728 * okB;
  const s_ = l - 0.0894841775 * okA - 1.291485548 * okB;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const eps = 1e-6;
  if (lr < -eps || lr > 1 + eps || lg < -eps || lg > 1 + eps || lb < -eps || lb > 1 + eps) {
    return null;
  }

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return {
    r: Math.round(delinearize(clamp01(lr)) * 255),
    g: Math.round(delinearize(clamp01(lg)) * 255),
    b: Math.round(delinearize(clamp01(lb)) * 255),
  };
}

/** 0-255 channels → #rrggbb. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (v: number) =>
    Math.min(255, Math.max(0, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Whether text drawn on this color should use the app's dark ink rather than
 * its light ink. Mirrors the WCAG pick `applyAccent` makes: compare the
 * contrast each ink achieves and keep the winner. The luminance constants are
 * the resolved values of --primary-foreground (:root) and --foreground.
 */
export const DARK_INK_LUMINANCE = 0.012;
export const LIGHT_INK_LUMINANCE = 0.92;

export function prefersDarkInk(rgb: Rgb): boolean {
  const luminance = relativeLuminance(rgb);
  return (
    contrastRatio(luminance, DARK_INK_LUMINANCE) >= contrastRatio(luminance, LIGHT_INK_LUMINANCE)
  );
}
