import { useSplashGlass } from './SplashGlass.hooks';

/**
 * Glass-surface cues — the wet pane between the viewer and the night scene.
 *
 * Three static layers, all derived from --foreground so they add texture
 * without tinting the canvas:
 *  - top/bottom condensation film haze (original)
 *  - a faint full-bleed edge vignette so the composition reads as seen through
 *    a window frame (the only "frame" cue besides the mullion)
 *  - ONE low-alpha vertical mullion as texture (a soft 1px seam, NOT the mock's
 *    7px hard bar)
 *
 * The wet-glass hint (`backdrop-filter: blur(0.4px)`) carries the
 * `.splash-glass-blur` class so it is dropped under `[data-perf-mode='low']`
 * (matches the existing `.glass` low-perf override).
 *
 * Alphas tuned against --background (oklch ~0.08) so everything stays just
 * perceptible — present enough to read as glass, restrained enough to keep the
 * canvas near-monochrome charcoal.
 */
export default function SplashGlass() {
  useSplashGlass();

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {/* Condensation film haze + edge vignette */}
      <div
        className="splash-glass-blur absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, oklch(from var(--foreground) l c h / 0.04) 0%, transparent 32%, transparent 68%, oklch(from var(--foreground) l c h / 0.06) 100%)',
          boxShadow:
            'inset 0 0 120px oklch(from var(--background) calc(l * 0.6) c h / 0.55), inset 0 0 40px oklch(from var(--background) calc(l * 0.5) c h / 0.4)',
          backdropFilter: 'blur(0.4px)',
        }}
      />

      {/* Single texture mullion — faint vertical seam, not a hard bar */}
      <div
        className="absolute inset-y-0"
        style={{
          left: '50%',
          width: '1px',
          transform: 'translateX(-50%)',
          background:
            'linear-gradient(180deg, transparent, oklch(from var(--foreground) l c h / 0.06) 25%, oklch(from var(--foreground) l c h / 0.06) 75%, transparent)',
        }}
      />
    </div>
  );
}
