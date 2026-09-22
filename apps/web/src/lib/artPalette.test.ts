import { describe, expect, it } from 'vitest';
import { extractPalette, artAccentHex, artInk, MONOCHROME_CHROMA } from './artPalette';
import { hexToRgb, rgbToOklch } from './color';

/** Build RGBA pixel data from a list of [hex, pixelCount] pairs. */
function pixels(entries: Array<[string, number]>): Uint8ClampedArray {
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  const data = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [hex, count] of entries) {
    const { r, g, b } = hexToRgb(hex)!;
    for (let n = 0; n < count; n++) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
      i += 4;
    }
  }
  return data;
}

describe('extractPalette', () => {
  it('returns null for empty or fully-transparent data', () => {
    expect(extractPalette(new Uint8ClampedArray(0))).toBeNull();
    const transparent = new Uint8ClampedArray(64 * 4); // alpha 0 throughout
    expect(extractPalette(transparent)).toBeNull();
  });

  it('classifies dominant, vibrant, dark and light from a synthetic cover', () => {
    const palette = extractPalette(
      pixels([
        ['#405066', 700], // muted slate — most of the cover
        ['#e0603a', 150], // saturated orange — the accent
        ['#101018', 100], // near-black corner
        ['#f0ead8', 74], // cream highlight
      ])
    )!;

    expect(palette).not.toBeNull();
    expect(palette.isMonochrome).toBe(false);
    expect(palette.dominant.hex).toBe('#405066');
    // The vibrant swatch is the orange, not the populous slate.
    expect(rgbToOklch(palette.vibrant.rgb).c).toBeGreaterThan(0.1);
    // Dark and light land on the tonal extremes.
    expect(rgbToOklch(palette.dark.rgb).l).toBeLessThan(0.35);
    expect(rgbToOklch(palette.light.rgb).l).toBeGreaterThan(0.85);
  });

  it('ignores one-off stray pixels', () => {
    const palette = extractPalette(
      pixels([
        ['#405066', 1000],
        ['#ff0000', 1], // a single hot pixel — below the population floor
      ])
    )!;
    expect(palette.vibrant.hex).toBe('#405066');
  });

  it('flags black-and-white sleeves as monochrome', () => {
    const palette = extractPalette(
      pixels([
        ['#181818', 500],
        ['#e8e8e8', 300],
        ['#808080', 200],
      ])
    )!;
    expect(palette.isMonochrome).toBe(true);
  });
});

describe('artAccentHex', () => {
  const colorful = extractPalette(
    pixels([
      ['#405066', 700],
      ['#e0603a', 300],
    ])
  );

  it('returns a calm-clamped accent for colorful covers', () => {
    const hex = artAccentHex(colorful)!;
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    const ok = rgbToOklch(hexToRgb(hex)!);
    // The calm clamp: preset-band lightness, capped chroma.
    expect(ok.l).toBeGreaterThanOrEqual(0.64);
    expect(ok.l).toBeLessThanOrEqual(0.81);
    expect(ok.c).toBeLessThanOrEqual(0.145);
    expect(ok.c).toBeGreaterThanOrEqual(MONOCHROME_CHROMA);
    // Hue survives the clamp — it still reads as the record's orange.
    const source = rgbToOklch(hexToRgb('#e0603a')!);
    expect(Math.abs(ok.h - source.h)).toBeLessThan(15);
  });

  it('degrades to null for monochrome covers and missing palettes', () => {
    const mono = extractPalette(
      pixels([
        ['#181818', 500],
        ['#e8e8e8', 500],
      ])
    );
    expect(artAccentHex(mono)).toBeNull();
    expect(artAccentHex(null)).toBeNull();
  });
});

describe('artInk', () => {
  it('keeps ink readable on the dominant swatch', () => {
    const bright = extractPalette(pixels([['#f0ead8', 100]]))!;
    const dark = extractPalette(pixels([['#101018', 100]]))!;
    expect(artInk(bright)).toBe('oklch(0.1 0.02 280)');
    expect(artInk(dark)).toBe('oklch(0.97 0.01 280)');
  });
});
