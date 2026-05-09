interface SplashBlindSweepProps {
  disabled: boolean;
}

/**
 * A single full-screen vertical gradient strip that slides horizontally
 * across the field over 11 seconds — a slow CRT-scanline/window-blind sweep.
 *
 * Disabled under lowPerformanceMode (prop passed from parent) to match the
 * pattern used by AmbientBackground and the noise overlay.
 *
 * Keep alpha ≤ 8% so it reads as ambient motion, not an OS error overlay.
 */
export function SplashBlindSweep({ disabled }: SplashBlindSweepProps) {
  if (disabled) return null;

  return (
    <div
      className="absolute inset-y-0 w-[30vw] pointer-events-none"
      style={{
        background:
          'linear-gradient(110deg, transparent 0%, oklch(from var(--primary) l c h / 0.08) 50%, transparent 100%)',
        animation: 'shiranami-blind-sweep 11s linear infinite',
      }}
      aria-hidden="true"
    />
  );
}
