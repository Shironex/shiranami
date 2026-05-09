import { useEffect, useRef } from 'react';

const STREAK_COUNT = 24;
const TICK_HZ = 60;
const REDRAW_EVERY = 2; // redraw every 2nd tick → 30Hz
const TICK_INTERVAL_MS = 1000 / TICK_HZ;

interface Streak {
  x: number; // viewport-relative, 0..1
  y: number; // current head position in px (negative = above viewport)
  length: number; // 80..140 px
  speed: number; // 140..220 px/s
  opacity: number; // 0.18..0.28
}

// xmur3-style 32-bit integer hash → uniform [0, 1). The previous LCG fed small
// sequential seeds and produced outputs in a ~6% band, clustering all streaks
// into one column.
function hash01(n: number): number {
  let h = (n + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

function makeStreak(index: number, viewportHeight: number, preWarm: boolean): Streak {
  const s0 = hash01(index * 1013 + 1);
  const s1 = hash01(index * 1013 + 2);
  const s2 = hash01(index * 1013 + 3);
  const s3 = hash01(index * 1013 + 4);
  const s4 = hash01(index * 1013 + 5);

  const length = 80 + s1 * 60; // 80..140
  const speed = 140 + s2 * 80; // 140..220

  const y = preWarm ? s4 * viewportHeight - length : -length - s4 * 200;

  return {
    x: s0,
    y,
    length,
    speed,
    opacity: 0.18 + s3 * 0.1, // 0.18..0.28
  };
}

function respawnStreak(index: number, streak: Streak): Streak {
  const salt = Math.floor((streak.y + streak.length) * 7919) | 0;
  const s0 = hash01(index * 7919 + salt + 1);
  const s1 = hash01(index * 7919 + salt + 2);
  const s2 = hash01(index * 7919 + salt + 3);
  const s3 = hash01(index * 7919 + salt + 4);

  return {
    x: s0,
    y: -streak.length - s3 * 200,
    length: 80 + s1 * 60,
    speed: 140 + s2 * 80,
    opacity: 0.18 + s3 * 0.1,
  };
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  streaks: Streak[],
  foregroundColor: string,
  cssWidth: number,
  cssHeight: number
): void {
  // Clear in CSS-pixel space so the ctx.scale(dpr, dpr) transform applies.
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  for (const streak of streaks) {
    const x = streak.x * cssWidth;
    const headY = streak.y;
    const tailY = streak.y + streak.length;

    const grad = ctx.createLinearGradient(x, headY, x, tailY);
    grad.addColorStop(0, `oklch(from ${foregroundColor} l c h / 0)`);
    grad.addColorStop(0.15, `oklch(from ${foregroundColor} l c h / ${streak.opacity.toFixed(3)})`);
    grad.addColorStop(
      0.8,
      `oklch(from ${foregroundColor} l c h / ${(streak.opacity * 0.5).toFixed(3)})`
    );
    grad.addColorStop(1, `oklch(from ${foregroundColor} l c h / 0)`);

    ctx.beginPath();
    ctx.moveTo(x, headY);
    ctx.lineTo(x, tailY);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

/**
 * rAF-driven rain streak field for the splash canvas.
 *
 * 60Hz position update, 30Hz redraw. 24 streaks with deterministic LCG seeding
 * so the field looks stable across HMR reloads and hot restarts.
 *
 * Under `paused` or `staticFrame`, the rAF loop does not start and we render
 * a single frozen frame on mount instead.
 */
export function useSplashRain(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  paused: boolean,
  lowPerformanceMode: boolean,
  reducedMotion: boolean
): void {
  const streaksRef = useRef<Streak[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const tickCountRef = useRef<number>(0);
  const initializedRef = useRef(false);

  const staticFrame = paused || lowPerformanceMode || reducedMotion;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Derive foreground color from the CSS custom property at paint time.
    const fg =
      getComputedStyle(canvas).getPropertyValue('--foreground').trim() || 'oklch(0.93 0.01 280)';

    // CSS-pixel dimensions — the rendering coordinate system after ctx.scale(dpr, dpr).
    // canvas.width / canvas.height are device pixels; using them for positioning
    // would put streaks at 2x scale on HiDPI and clip 3/4 of them off-canvas.
    const cssWidth = () => canvas.clientWidth || window.innerWidth;
    const cssHeight = () => canvas.clientHeight || window.innerHeight;

    // Initialize streaks once
    if (!initializedRef.current) {
      streaksRef.current = Array.from({ length: STREAK_COUNT }, (_, i) =>
        makeStreak(i, cssHeight(), true)
      );
      initializedRef.current = true;
    }

    // Always draw at least one frame
    drawFrame(ctx, streaksRef.current, fg, cssWidth(), cssHeight());

    if (staticFrame) return;

    const loop = (now: number) => {
      const elapsed = now - lastTickRef.current;

      if (elapsed >= TICK_INTERVAL_MS) {
        lastTickRef.current = now;
        tickCountRef.current += 1;

        // Update positions every tick
        const dt = TICK_INTERVAL_MS / 1000;
        const h = cssHeight();
        streaksRef.current = streaksRef.current.map((s, i) => {
          const nextY = s.y + s.speed * dt;
          if (nextY > h) return respawnStreak(i, s);
          return { ...s, y: nextY };
        });

        // Redraw every other tick (30Hz)
        if (tickCountRef.current % REDRAW_EVERY === 0) {
          drawFrame(ctx, streaksRef.current, fg, cssWidth(), cssHeight());
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [canvasRef, staticFrame]);
}
