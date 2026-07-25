import { useSplashSteam } from './SplashSteam.hooks';
import type { ISplashSteamProps } from './SplashSteam.types';

/**
 * Rising steam above the coffee cup — 3 stroke-dash paths drifting up and
 * fading on a staggered loop.
 *
 * Steam exists only as motion (a stroke-dash sweep has no meaningful static
 * frame), so each path carries the `.splash-steam` class and the global
 * reduced-motion / `[data-perf-mode='low']` guards set `display:none` — the
 * steam vanishes entirely under either gate, leaving just the static cup.
 */
export default function SplashSteam(props: ISplashSteamProps) {
  const { strokeColor, wisps } = useSplashSteam(props);

  // Lift the `.map` above the return so it is not in JSX render position
  // (keeps the declarative-JSX rule satisfied).
  const wispPaths = wisps.map(wisp => (
    <path
      key={wisp.d}
      className="splash-steam"
      d={wisp.d}
      fill="none"
      stroke={strokeColor}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray="140"
      opacity={wisp.opacity}
      style={{ animation: wisp.animation }}
    />
  ));

  return (
    <div
      className="absolute pointer-events-none"
      style={{ right: '64px', bottom: '138px', width: '60px', height: '110px' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 60 110" style={{ overflow: 'visible' }}>
        {wispPaths}
      </svg>
    </div>
  );
}
