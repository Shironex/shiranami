/**
 * Subtle monochrome glass film — a top and bottom haze hinting at condensation
 * on the pane. Strictly derived from --foreground so it adds texture without
 * tinting the canvas.
 *
 * Alphas tuned against --background (oklch 0.08) so the haze is just barely
 * perceptible — present enough to read as glass, restrained enough to keep
 * the canvas feeling near-monochrome charcoal.
 */
export function SplashGlass() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'linear-gradient(180deg, oklch(from var(--foreground) l c h / 0.04) 0%, transparent 32%, transparent 68%, oklch(from var(--foreground) l c h / 0.06) 100%)',
      }}
      aria-hidden="true"
    />
  );
}
