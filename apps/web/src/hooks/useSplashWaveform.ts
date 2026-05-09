import { useEffect, useRef, useState } from 'react';

const BAR_COUNT = 64;
const BASE_HEIGHT = 6;
const AMP_HEIGHT = 22;
const TICK_HZ = 30;
const TICK_INTERVAL_MS = 1000 / TICK_HZ;

function computeBarHeights(t: number): number[] {
  const heights: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    heights.push(BASE_HEIGHT + AMP_HEIGHT * (0.5 + 0.5 * Math.sin(i * 0.55 + t * 1.3)));
  }
  return heights;
}

function staticBarHeights(): number[] {
  return computeBarHeights(0);
}

/**
 * Produces an array of `BAR_COUNT` bar heights for the radial waveform.
 *
 * Under `paused`, the rAF ticker stops and heights freeze at the last frame
 * (or at the static seed if never started). Under `lowPerformanceMode`, we
 * never start the ticker and return a static frame — matching how AmbientBackground
 * and the noise overlay skip their animation paths.
 */
export function useSplashWaveform(paused: boolean, lowPerformanceMode: boolean): number[] {
  const [heights, setHeights] = useState<number[]>(staticBarHeights);
  const tickCount = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (paused || lowPerformanceMode) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const loop = (now: number) => {
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - lastTickRef.current;
      if (elapsed >= TICK_INTERVAL_MS) {
        lastTickRef.current = now;
        tickCount.current += 1;
        const t = (now - startTimeRef.current) / 1000;
        setHeights(computeBarHeights(t));
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
  }, [paused, lowPerformanceMode]);

  return heights;
}
