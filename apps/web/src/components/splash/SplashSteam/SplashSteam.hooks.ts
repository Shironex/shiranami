import type { ISplashSteamProps, ISplashSteamView } from './SplashSteam.types';

/**
 * Mock literal mapping: stroke `oklch(0.92 0.04 295 / 0.35)` -> `--foreground`
 * at low alpha (cool vapor highlight, not violet).
 */
const STROKE_COLOR = 'oklch(from var(--foreground) l c h / 0.3)';

// Geometry + stagger for the three wisps. The delays are what keep them from
// rising in lockstep, so they travel with the paths rather than the shell.
const WISPS: readonly {
  readonly d: string;
  readonly opacity?: number;
  readonly delay: string;
}[] = [
  { d: 'M30 100 Q24 80 30 60 Q36 40 30 20 Q26 8 30 0', delay: '' },
  { d: 'M18 100 Q14 80 18 60 Q22 40 18 20', opacity: 0.65, delay: ' 0.8s' },
  { d: 'M42 100 Q46 80 42 60 Q38 40 42 20', opacity: 0.45, delay: ' 1.6s' },
];

/**
 * Steam exists only as motion, so the hook's job is resolving each wisp's
 * staggered loop and dropping all three at once under reduced motion — a
 * belt-and-suspenders guard alongside the `.splash-steam` stylesheet rule that
 * hides them outright.
 */
export function useSplashSteam({ reducedMotion }: ISplashSteamProps): ISplashSteamView {
  const wisps = WISPS.map(wisp => ({
    d: wisp.d,
    opacity: wisp.opacity,
    animation: reducedMotion ? undefined : `steam-rise 3.6s${wisp.delay} ease-in-out infinite`,
  }));

  return { strokeColor: STROKE_COLOR, wisps };
}
