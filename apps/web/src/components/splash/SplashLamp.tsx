interface SplashLampProps {
  /** When true the breathe loop is suppressed (reduced-motion or low-perf). */
  disabled?: boolean;
}

/**
 * Single localized warm glow at (82%, 18%) — the streetlamp two doors down.
 *
 * Uses --favorite (warm rose) rather than --primary so no violet bleeds onto
 * the canvas. Alphas tuned against --background (oklch 0.08) so the glow is
 * clearly perceptible at the hotspot but fades to transparent before reaching
 * the wordmark zone — the only field-level color in the composition.
 *
 * The breathe loop is 9s ease-in-out so it reads as a steady lamp modulated
 * by rain on the bulb, not a pulse.
 */
export function SplashLamp({ disabled = false }: SplashLampProps) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'radial-gradient(ellipse 640px 460px at 82% 18%, oklch(from var(--favorite) l c h / 0.22) 0%, oklch(from var(--favorite) l c h / 0.09) 45%, transparent 78%)',
        animation: disabled ? undefined : 'shiranami-lamp-breathe 9s ease-in-out infinite',
      }}
      aria-hidden="true"
    />
  );
}
