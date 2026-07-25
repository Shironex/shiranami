import { useSplashRain } from './SplashRain.hooks';
import type { ISplashRainProps } from './SplashRain.types';

/**
 * Full-bleed canvas rain layer.
 *
 * Sits z-above the wordmark so streaks read as running down the inside of
 * the glass between the viewer and the etched 白波. aria-hidden — purely
 * decorative texture.
 */
export default function SplashRain(props: ISplashRainProps) {
  const { canvasRef } = useSplashRain(props);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
