/**
 * Foreground coffee cup, bottom-right — the cafe-window prop.
 *
 * Static product art. The mug body is derived from `--background` (cool dark
 * ceramic) and the violet rim/highlight from `--primary`; the coffee fill and
 * crema keep a warm brown gradient confined to this SVG, which is acceptable
 * as product art rather than theme color (per the redesign token mapping).
 *
 * The drop-shadow filter carries the `.splash-cup-shadow` class so it is
 * dropped under `[data-perf-mode='low']` (compositor cost). The cup itself
 * never animates.
 */
export function SplashCup() {
  return (
    <div
      className="splash-cup-shadow absolute pointer-events-none"
      style={{
        right: '38px',
        bottom: '30px',
        filter: 'drop-shadow(0 14px 24px oklch(from var(--background) calc(l * 0.3) c h / 0.55))',
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 110" style={{ width: '110px', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="splash-cup-body" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(from var(--background) calc(l + 0.12) c h / 1)" />
            <stop offset="100%" stopColor="oklch(from var(--background) calc(l + 0.02) c h / 1)" />
          </linearGradient>
          <linearGradient id="splash-cup-coffee" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.3 0.1 60)" />
            <stop offset="100%" stopColor="oklch(0.16 0.06 60)" />
          </linearGradient>
        </defs>

        {/* saucer */}
        <ellipse
          cx="60"
          cy="98"
          rx="56"
          ry="8"
          fill="oklch(from var(--background) calc(l + 0.02) c h / 1)"
          opacity="0.85"
        />
        <ellipse
          cx="60"
          cy="96"
          rx="50"
          ry="6"
          fill="oklch(from var(--background) calc(l + 0.05) c h / 1)"
        />

        {/* handle */}
        <path
          d="M88 50 Q108 50 108 65 Q108 80 88 80"
          fill="none"
          stroke="url(#splash-cup-body)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* mug body */}
        <path
          d="M16 40 Q14 38 16 36 L84 36 Q86 38 84 40 L80 88 Q78 96 70 96 L30 96 Q22 96 20 88 Z"
          fill="url(#splash-cup-body)"
          stroke="oklch(from var(--primary) l c h / 0.18)"
          strokeWidth="0.8"
        />

        {/* coffee surface */}
        <ellipse cx="50" cy="40" rx="34" ry="5" fill="url(#splash-cup-coffee)" />
        <ellipse
          cx="50"
          cy="40"
          rx="34"
          ry="5"
          fill="none"
          stroke="oklch(0.5 0.16 60 / 0.5)"
          strokeWidth="0.5"
        />

        {/* crema highlights */}
        <ellipse cx="42" cy="39" rx="6" ry="1.5" fill="oklch(0.55 0.16 60 / 0.5)" />
        <ellipse cx="60" cy="40.5" rx="4" ry="1" fill="oklch(0.55 0.16 60 / 0.3)" />

        {/* highlight on mug */}
        <path
          d="M20 42 L24 90"
          stroke="oklch(from var(--primary) l c h / 0.25)"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
