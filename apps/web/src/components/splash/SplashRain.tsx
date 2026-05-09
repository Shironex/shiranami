import { useEffect, useRef } from 'react';
import { useSplashRain } from '@/hooks/useSplashRain';

interface SplashRainProps {
  /** Freeze the rain field (error variant — rain pauses but does not disappear). */
  paused: boolean;
  lowPerformanceMode: boolean;
  reducedMotion: boolean;
}

/**
 * Full-bleed canvas rain layer.
 *
 * Sits z-above the wordmark so streaks read as running down the inside of
 * the glass between the viewer and the etched 白波. aria-hidden — purely
 * decorative texture.
 *
 * Canvas dimensions are kept in sync with the window via ResizeObserver.
 * The canvas is sized in device pixels (window.devicePixelRatio) and scaled
 * via CSS to fill the overlay, so streaks stay sharp on HiDPI displays.
 */
export function SplashRain({ paused, lowPerformanceMode, reducedMotion }: SplashRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sync canvas dimensions to device pixel ratio on mount + resize.
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

  useSplashRain(canvasRef, paused, lowPerformanceMode, reducedMotion);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
