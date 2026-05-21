interface SplashSteamProps {
  reducedMotion: boolean;
}

/**
 * Rising steam above the coffee cup — 3 stroke-dash paths drifting up and
 * fading on a staggered loop.
 *
 * Steam exists only as motion (a stroke-dash sweep has no meaningful static
 * frame), so each path carries the `.splash-steam` class and the global
 * reduced-motion / `[data-perf-mode='low']` guards set `display:none` — the
 * steam vanishes entirely under either gate, leaving just the static cup.
 * The `reducedMotion` prop additionally drops the inline animation as a
 * belt-and-suspenders guard.
 *
 * Mock literal mapping: stroke `oklch(0.92 0.04 295 / 0.35)` -> `--foreground`
 * at low alpha (cool vapor highlight, not violet).
 */
export function SplashSteam({ reducedMotion }: SplashSteamProps) {
  const baseStroke = 'oklch(from var(--foreground) l c h / 0.3)';

  return (
    <div
      className="absolute pointer-events-none"
      style={{ right: '64px', bottom: '138px', width: '60px', height: '110px' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 60 110" style={{ overflow: 'visible' }}>
        <path
          className="splash-steam"
          d="M30 100 Q24 80 30 60 Q36 40 30 20 Q26 8 30 0"
          fill="none"
          stroke={baseStroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="140"
          style={{
            animation: reducedMotion ? undefined : 'steam-rise 3.6s ease-in-out infinite',
          }}
        />
        <path
          className="splash-steam"
          d="M18 100 Q14 80 18 60 Q22 40 18 20"
          fill="none"
          stroke={baseStroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="140"
          opacity={0.65}
          style={{
            animation: reducedMotion ? undefined : 'steam-rise 3.6s 0.8s ease-in-out infinite',
          }}
        />
        <path
          className="splash-steam"
          d="M42 100 Q46 80 42 60 Q38 40 42 20"
          fill="none"
          stroke={baseStroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="140"
          opacity={0.45}
          style={{
            animation: reducedMotion ? undefined : 'steam-rise 3.6s 1.6s ease-in-out infinite',
          }}
        />
      </svg>
    </div>
  );
}
