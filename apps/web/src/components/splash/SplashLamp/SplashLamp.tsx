import { useSplashLamp } from './SplashLamp.hooks';
import type { ISplashLampProps } from './SplashLamp.types';

/**
 * Single localized warm glow at (82%, 18%) — the streetlamp two doors down.
 *
 * Uses --favorite (warm rose) rather than --primary so no violet bleeds onto
 * the canvas. Alphas tuned against --background (oklch 0.08) so the glow is
 * clearly perceptible at the hotspot but fades to transparent before reaching
 * the wordmark zone — the only field-level color in the composition.
 */
export default function SplashLamp(props: ISplashLampProps) {
  const { animation } = useSplashLamp(props);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'radial-gradient(ellipse 420px 320px at 88% 14%, oklch(from var(--favorite) l c h / 0.28) 0%, oklch(from var(--favorite) l c h / 0.10) 38%, transparent 70%)',
        animation,
      }}
      aria-hidden="true"
    />
  );
}
