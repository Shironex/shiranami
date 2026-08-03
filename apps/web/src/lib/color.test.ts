import { describe, expect, it } from 'vitest';
import {
  hexToRgb,
  isHexColor,
  rgbToHex,
  rgbToOklch,
  oklchToRgb,
  prefersDarkInk,
  relativeLuminance,
  contrastRatio,
} from './color';

describe('hex parsing', () => {
  it('accepts only #rrggbb', () => {
    expect(isHexColor('#9b7deb')).toBe(true);
    expect(isHexColor('#9B7DEB')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('9b7deb')).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });

  it('round-trips through rgbToHex', () => {
    expect(rgbToHex(hexToRgb('#9b7deb')!)).toBe('#9b7deb');
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
  });
});

describe('OKLCH conversion', () => {
  it('maps white and black to the lightness poles with no chroma', () => {
    const white = rgbToOklch({ r: 255, g: 255, b: 255 });
    const black = rgbToOklch({ r: 0, g: 0, b: 0 });
    expect(white.l).toBeCloseTo(1, 2);
    expect(white.c).toBeCloseTo(0, 2);
    expect(black.l).toBeCloseTo(0, 2);
    expect(black.c).toBeCloseTo(0, 2);
  });

  it('round-trips in-gamut colors within a channel step', () => {
    for (const hex of ['#9b7deb', '#f09e60', '#60b8e0', '#336644']) {
      const rgb = hexToRgb(hex)!;
      const back = oklchToRgb(rgbToOklch(rgb));
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
    }
  });

  it('walks out-of-gamut requests back to a same-hue printable color', () => {
    // A chroma no sRGB green reaches: must degrade, not clip to garbage.
    const rgb = oklchToRgb({ l: 0.7, c: 0.45, h: 140 });
    const ok = rgbToOklch(rgb);
    expect(ok.l).toBeCloseTo(0.7, 1);
    // Hue preserved within a few degrees; chroma reduced into gamut.
    expect(Math.abs(ok.h - 140)).toBeLessThan(5);
    expect(ok.c).toBeLessThan(0.45);
  });
});

describe('ink pick', () => {
  it('puts dark ink on bright colors and light ink on dark colors', () => {
    expect(prefersDarkInk({ r: 250, g: 230, b: 120 })).toBe(true);
    expect(prefersDarkInk({ r: 20, g: 24, b: 60 })).toBe(false);
  });

  it('agrees with a direct WCAG comparison', () => {
    const rgb = { r: 155, g: 125, b: 235 };
    const luminance = relativeLuminance(rgb);
    const darkWins = contrastRatio(luminance, 0.012) >= contrastRatio(luminance, 0.92);
    expect(prefersDarkInk(rgb)).toBe(darkWins);
  });
});
