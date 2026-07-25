import { useEffect, useRef } from 'react';
import { useSplashRain as useSplashRainField } from '@/hooks/useSplashRain';
import type { ISplashRainProps, ISplashRainView } from './SplashRain.types';

/**
 * Owns the canvas element and its sizing contract, then hands it to the shared
 * rAF field hook.
 *
 * The canvas is sized in device pixels (window.devicePixelRatio) and scaled via
 * CSS to fill the overlay, so streaks stay sharp on HiDPI displays; a
 * ResizeObserver on the document element keeps that in sync as the window
 * changes. The field hook is aliased on import because this module's own export
 * has to be `useSplashRain` to match the component.
 */
export function useSplashRain({
  paused,
  lowPerformanceMode,
  reducedMotion,
}: ISplashRainProps): ISplashRainView {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio ?? 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);

  useSplashRainField(canvasRef, paused, lowPerformanceMode, reducedMotion);

  return { canvasRef };
}
