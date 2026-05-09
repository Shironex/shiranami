interface SplashLampProps {
  /** When true the breathe loop is suppressed (reduced-motion or low-perf). */
  disabled?: boolean;
}

/**
 * Single localized warm glow at (82%, 18%) — the streetlamp two doors down.
 *
 * Uses --favorite (warm rose) rather than --primary so no violet bleeds onto
 * the canvas. Alpha ceiling is 0.06 at the hotspot, fading to transparent at
 * 75% radial stop — the glow never reaches the wordmark or rain area.
 *
 * The breathe loop is 9s ease-in-out (slower than the old 6s glow-breathe)
 * so it reads as a steady lamp modulated by rain on the bulb, not a pulse.
 */
export function SplashLamp({ disabled = false }: SplashLampProps) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'radial-gradient(ellipse 520px 380px at 82% 18%, oklch(from var(--favorite) l c h / 0.06) 0%, oklch(from var(--favorite) l c h / 0.025) 45%, transparent 75%)',
        animation: disabled
          ? undefined
          : 'shiranami-lamp-breathe 9s ease-in-out infinite',
      }}
      aria-hidden="true"
    />
  );
}
