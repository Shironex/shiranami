/**
 * The eased "follow the record" accent: instead of snapping `--primary` to the
 * next cover's color, tween it hue-to-hue in OKLCH over the audio-fade window.
 * Interpolating in OKLCH (shortest hue arc, chroma kept) is what stops two
 * saturated covers from crossing through gray mid-fade — the sRGB midpoint of
 * red and blue is mud; the OKLCH midpoint is a live magenta.
 *
 * One tween exists at a time, module-wide: starting a new one cancels the old
 * (a rapid five-track skip must not queue five easings).
 */

import { hexToRgb, rgbToHex, rgbToOklch, oklchToRgb, type Oklch } from '@/lib/color';

/** Interpolate two OKLCH colors, taking the shortest hue arc. */
export function mixOklch(from: Oklch, to: Oklch, t: number): Oklch {
  let dh = to.h - from.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return {
    l: from.l + (to.l - from.l) * t,
    c: from.c + (to.c - from.c) * t,
    h: (from.h + dh * t + 360) % 360,
  };
}

/** Hex-to-hex OKLCH mix — the pure core the tween loop runs on. */
export function mixOklchHex(fromHex: string, toHex: string, t: number): string {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  if (!from || !to) return toHex;
  if (t <= 0) return fromHex;
  if (t >= 1) return toHex;
  return rgbToHex(oklchToRgb(mixOklch(rgbToOklch(from), rgbToOklch(to), t)));
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2);

let activeFrame: number | null = null;

function cancelActive(): void {
  if (activeFrame !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(activeFrame);
  }
  activeFrame = null;
}

/**
 * Ease `apply` from `fromHex` to `toHex` over `durationMs`. Returns a cancel
 * handle; starting another tween cancels this one implicitly. A zero/negative
 * duration (reduced motion) applies the target immediately.
 */
export function startAccentTween(
  fromHex: string,
  toHex: string,
  durationMs: number,
  apply: (hex: string) => void
): () => void {
  cancelActive();

  if (durationMs <= 0 || fromHex === toHex || typeof requestAnimationFrame !== 'function') {
    apply(toHex);
    return () => {};
  }

  const start = performance.now();
  let cancelled = false;

  const step = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / durationMs);
    apply(mixOklchHex(fromHex, toHex, easeInOut(t)));
    if (t < 1) {
      activeFrame = requestAnimationFrame(step);
    } else {
      activeFrame = null;
    }
  };

  activeFrame = requestAnimationFrame(step);

  return () => {
    cancelled = true;
    cancelActive();
  };
}
