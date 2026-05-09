/**
 * Subtle monochrome glass film — a top and bottom haze hinting at condensation
 * on the pane. Strictly derived from --foreground at very low alpha so it
 * adds texture without tinting the canvas.
 *
 * Maximum contribution at any pixel: 0.018 alpha. No animation.
 */
export function SplashGlass() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'linear-gradient(180deg, oklch(from var(--foreground) l c h / 0.012) 0%, transparent 35%, transparent 65%, oklch(from var(--foreground) l c h / 0.018) 100%)',
      }}
      aria-hidden="true"
    />
  );
}
