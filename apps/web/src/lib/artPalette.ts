/**
 * Five-swatch palette extraction for album covers, and the OKLCH-clamped
 * accent derived from it. All pure functions over pixel data so the whole
 * layer is unit-testable without a DOM; `useAmbientColor` owns the single
 * canvas read that feeds them.
 */

import { rgbToOklch, oklchToRgb, rgbToHex, prefersDarkInk, type Rgb } from '@/lib/color';

export interface ArtSwatch {
  rgb: Rgb;
  hex: string;
}

export interface ArtPalette {
  /** The most populous color region — the cover's overall cast. */
  dominant: ArtSwatch;
  /** The most saturated mid-lightness color — the cover's "voice". */
  vibrant: ArtSwatch;
  /** A low-chroma mid-lightness companion for quiet surfaces. */
  muted: ArtSwatch;
  /** The darkest populated region. */
  dark: ArtSwatch;
  /** The lightest populated region. */
  light: ArtSwatch;
  /** True when nothing on the cover carries real chroma (b&w sleeves). */
  isMonochrome: boolean;
}

/** Ordered for the `--art-1…5` custom properties. */
export const ART_SWATCH_ORDER = ['dominant', 'vibrant', 'muted', 'dark', 'light'] as const;

// Below this OKLCH chroma a cover counts as monochrome and must degrade to
// the theme accent rather than repaint the app gray.
export const MONOCHROME_CHROMA = 0.04;

// The calm clamp for the follow-the-record accent: chroma capped below the
// wildest presets (~0.15 in globals.css), lightness pinned to the band the
// hand-tuned presets occupy so the WCAG foreground pick stays predictable.
const ACCENT_MAX_CHROMA = 0.14;
const ACCENT_MIN_CHROMA = 0.06;
const ACCENT_MIN_L = 0.65;
const ACCENT_MAX_L = 0.8;

/** 5-bit-per-channel quantization bucket key. */
function bucketKey(r: number, g: number, b: number): number {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Extract the five swatches from RGBA pixel data (any resolution — callers
 * should downsample to ~32×32 first; the math is resolution-independent).
 * Fully transparent pixels are ignored so padded covers don't skew the cast.
 */
export function extractPalette(data: Uint8ClampedArray): ArtPalette | null {
  const buckets = new Map<number, Bucket>();
  let total = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = bucketKey(r, g, b);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
    total++;
  }

  if (total === 0) return null;

  // Only regions that cover at least ~0.5% of the image get a vote — a single
  // stray pixel must not become the "light" swatch.
  const floor = Math.max(1, Math.floor(total * 0.005));
  const candidates = [...buckets.values()]
    .filter(b => b.count >= floor)
    .map(b => {
      const rgb: Rgb = {
        r: Math.round(b.r / b.count),
        g: Math.round(b.g / b.count),
        b: Math.round(b.b / b.count),
      };
      return { rgb, count: b.count, ok: rgbToOklch(rgb) };
    });

  if (candidates.length === 0) return null;

  const byCount = [...candidates].sort((a, b) => b.count - a.count);
  const dominant = byCount[0];

  // Vibrant: chroma weighted by closeness to mid lightness, so a saturated
  // near-black never outruns a true accent color.
  const midWeight = (l: number) => 1 - Math.min(1, Math.abs(l - 0.6) / 0.6);
  let vibrant = dominant;
  let vibrantScore = -1;
  let muted = dominant;
  let mutedScore = -1;
  let dark = dominant;
  let light = dominant;
  let maxChroma = 0;

  for (const c of candidates) {
    maxChroma = Math.max(maxChroma, c.ok.c);
    const vScore = c.ok.c * (0.4 + 0.6 * midWeight(c.ok.l));
    if (vScore > vibrantScore) {
      vibrantScore = vScore;
      vibrant = c;
    }
    if (c.ok.c <= 0.07) {
      const mScore = midWeight(c.ok.l) * Math.sqrt(c.count);
      if (mScore > mutedScore) {
        mutedScore = mScore;
        muted = c;
      }
    }
    if (c.ok.l < rgbToOklch(dark.rgb).l) dark = c;
    if (c.ok.l > rgbToOklch(light.rgb).l) light = c;
  }

  const swatch = (c: { rgb: Rgb }): ArtSwatch => ({ rgb: c.rgb, hex: rgbToHex(c.rgb) });

  return {
    dominant: swatch(dominant),
    vibrant: swatch(vibrant),
    muted: swatch(mutedScore >= 0 ? muted : dominant),
    dark: swatch(dark),
    light: swatch(light),
    isMonochrome: maxChroma < MONOCHROME_CHROMA,
  };
}

/**
 * The "follow the record" accent: the cover's vibrant swatch clamped into
 * calm. Chroma is capped (a neon single must not repaint the app), lightness
 * is pinned to the preset band, and monochrome covers return null so the
 * caller degrades to the theme accent instead of graying the whole app.
 */
export function artAccentHex(palette: ArtPalette | null): string | null {
  if (!palette || palette.isMonochrome) return null;
  const ok = rgbToOklch(palette.vibrant.rgb);
  if (ok.c < MONOCHROME_CHROMA) return null;
  return rgbToHex(
    oklchToRgb({
      l: Math.min(ACCENT_MAX_L, Math.max(ACCENT_MIN_L, ok.l)),
      c: Math.min(ACCENT_MAX_CHROMA, Math.max(ACCENT_MIN_CHROMA, ok.c)),
      h: ok.h,
    })
  );
}

/** The ink color (as a CSS color) that stays readable on the dominant swatch. */
export function artInk(palette: ArtPalette): string {
  return prefersDarkInk(palette.dominant.rgb) ? 'oklch(0.1 0.02 280)' : 'oklch(0.97 0.01 280)';
}
