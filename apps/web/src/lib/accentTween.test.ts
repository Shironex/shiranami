import { describe, expect, it, vi, afterEach } from 'vitest';
import { mixOklch, mixOklchHex, startAccentTween } from './accentTween';
import { hexToRgb, rgbToOklch } from './color';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mixOklch', () => {
  it('takes the shortest hue arc across the 0° seam', () => {
    const mid = mixOklch({ l: 0.7, c: 0.1, h: 350 }, { l: 0.7, c: 0.1, h: 10 }, 0.5);
    expect(mid.h).toBeCloseTo(0, 5);
  });

  it('interpolates lightness and chroma linearly', () => {
    const mid = mixOklch({ l: 0.4, c: 0.05, h: 100 }, { l: 0.8, c: 0.15, h: 100 }, 0.5);
    expect(mid.l).toBeCloseTo(0.6, 5);
    expect(mid.c).toBeCloseTo(0.1, 5);
  });
});

describe('mixOklchHex', () => {
  it('never crosses through mud between two saturated accents', () => {
    // The sRGB midpoint of red and blue is a desaturated gray-purple; the
    // OKLCH midpoint keeps the chroma of a live color. This is the whole
    // reason the tween runs in OKLCH.
    const mid = rgbToOklch(hexToRgb(mixOklchHex('#e04040', '#4040e0', 0.5))!);
    const from = rgbToOklch(hexToRgb('#e04040')!);
    const to = rgbToOklch(hexToRgb('#4040e0')!);
    expect(mid.c).toBeGreaterThanOrEqual(Math.min(from.c, to.c) * 0.85);
  });

  it('pins the endpoints exactly', () => {
    expect(mixOklchHex('#e04040', '#4040e0', 0)).toBe('#e04040');
    expect(mixOklchHex('#e04040', '#4040e0', 1)).toBe('#4040e0');
  });

  it('falls back to the target on malformed input', () => {
    expect(mixOklchHex('nope', '#4040e0', 0.5)).toBe('#4040e0');
  });
});

describe('startAccentTween', () => {
  it('applies the target immediately for a zero duration (reduced motion)', () => {
    const apply = vi.fn();
    startAccentTween('#e04040', '#4040e0', 0, apply);
    expect(apply).toHaveBeenCalledExactlyOnceWith('#4040e0');
  });

  it('applies the target immediately when from and to match', () => {
    const apply = vi.fn();
    startAccentTween('#4040e0', '#4040e0', 500, apply);
    expect(apply).toHaveBeenCalledExactlyOnceWith('#4040e0');
  });

  it('starting a new tween cancels the running one', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    const cancelled: number[] = [];
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      cancelled.push(id);
    });

    const first = vi.fn();
    const second = vi.fn();
    startAccentTween('#e04040', '#4040e0', 500, first);
    expect(frames).toHaveLength(1);

    startAccentTween('#4040e0', '#40e040', 500, second);
    // The first tween's pending frame was cancelled, not left to run out.
    expect(cancelled).toContain(1);

    vi.unstubAllGlobals();
  });
});
