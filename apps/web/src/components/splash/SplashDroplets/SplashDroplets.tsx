import { useSplashDroplets } from './SplashDroplets.hooks';

/**
 * Glass droplets clinging to the pane + a few running water streaks.
 *
 * Droplets: ~34 static SVG ellipses derived from `--foreground` (cool glass
 * highlight), matching the Rain/Glass color derivation. No animation.
 *
 * Streaks: 5 thin blurred gradient bars running down the glass, each carrying
 * the `.splash-streak` class. Streaks exist only as motion, so the global
 * reduced-motion / `[data-perf-mode='low']` guards set `display:none` on them —
 * they vanish entirely under either gate, leaving the static droplets.
 */
export default function SplashDroplets() {
  const { droplets, streaks } = useSplashDroplets();

  // Lift the `.map` calls above the return so they are not in JSX render
  // position (keeps the declarative-JSX rule satisfied).
  const dropletEllipses = droplets.map((d, i) => (
    <ellipse
      key={i}
      cx={d.cx}
      cy={d.cy}
      rx={d.rx}
      ry={d.ry}
      fill="oklch(from var(--foreground) l c h / 0.06)"
      stroke="oklch(from var(--foreground) l c h / 0.2)"
      strokeWidth="0.6"
    />
  ));

  const streakBars = streaks.map((s, i) => (
    <span
      key={i}
      className="splash-streak absolute"
      style={{
        left: s.left,
        top: '-10%',
        width: '1.5px',
        height: '28%',
        borderRadius: '1px',
        filter: 'blur(0.5px)',
        background:
          'linear-gradient(180deg, transparent, oklch(from var(--foreground) l c h / 0.22), oklch(from var(--foreground) l c h / 0.32))',
        animation: `streak-run ${s.duration} ${s.delay} linear infinite`,
      }}
    />
  ));

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {/* Static clinging droplets */}
      <svg
        className="absolute inset-0 block h-full w-full"
        viewBox="0 0 760 520"
        preserveAspectRatio="none"
      >
        {dropletEllipses}
      </svg>

      {/* Running water streaks — hidden under reduced-motion / low-perf */}
      {streakBars}
    </div>
  );
}
