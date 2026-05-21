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
 *
 * Mock literal mapping: droplet fill `oklch(0.78 0.04 280)` + stroke
 * `oklch(0.92 0.04 295)` + streak gradient → `--foreground` at low alpha.
 */

// Static droplets — viewBox 760x520, scaled non-uniformly to fill via the
// parent. cx/cy/rx/ry mirror the mock's hand-placed condensation pattern.
const DROPLETS: { cx: number; cy: number; rx: number; ry: number }[] = [
  { cx: 60, cy: 80, rx: 3, ry: 2.5 },
  { cx: 110, cy: 50, rx: 2.5, ry: 2 },
  { cx: 155, cy: 120, rx: 4, ry: 3.5 },
  { cx: 200, cy: 70, rx: 2, ry: 1.7 },
  { cx: 245, cy: 160, rx: 5, ry: 4.2 },
  { cx: 290, cy: 95, rx: 3, ry: 2.5 },
  { cx: 320, cy: 140, rx: 2, ry: 1.8 },
  { cx: 370, cy: 60, rx: 4.5, ry: 3.8 },
  { cx: 410, cy: 180, rx: 3, ry: 2.6 },
  { cx: 460, cy: 110, rx: 2.5, ry: 2 },
  { cx: 500, cy: 50, rx: 3.5, ry: 3 },
  { cx: 540, cy: 155, rx: 2, ry: 1.8 },
  { cx: 585, cy: 85, rx: 4, ry: 3.4 },
  { cx: 630, cy: 135, rx: 2.5, ry: 2 },
  { cx: 670, cy: 70, rx: 3, ry: 2.6 },
  { cx: 710, cy: 115, rx: 5, ry: 4.2 },
  { cx: 40, cy: 200, rx: 2, ry: 1.8 },
  { cx: 90, cy: 240, rx: 3.5, ry: 3 },
  { cx: 140, cy: 210, rx: 2, ry: 1.7 },
  { cx: 190, cy: 280, rx: 4, ry: 3.4 },
  { cx: 260, cy: 250, rx: 2.5, ry: 2 },
  { cx: 310, cy: 290, rx: 3, ry: 2.5 },
  { cx: 360, cy: 225, rx: 2, ry: 1.6 },
  { cx: 400, cy: 260, rx: 4.5, ry: 3.8 },
  { cx: 450, cy: 220, rx: 2.5, ry: 2 },
  { cx: 490, cy: 290, rx: 3, ry: 2.6 },
  { cx: 540, cy: 230, rx: 2, ry: 1.8 },
  { cx: 595, cy: 270, rx: 4, ry: 3.4 },
  { cx: 640, cy: 240, rx: 2.5, ry: 2 },
  { cx: 690, cy: 285, rx: 3.5, ry: 3 },
  // bigger crowning droplets
  { cx: 230, cy: 40, rx: 7, ry: 6 },
  { cx: 430, cy: 130, rx: 8, ry: 6.5 },
  { cx: 620, cy: 50, rx: 6, ry: 5 },
  { cx: 115, cy: 300, rx: 9, ry: 7 },
];

const STREAKS: { left: string; duration: string; delay: string }[] = [
  { left: '18%', duration: '5s', delay: '0.2s' },
  { left: '34%', duration: '7s', delay: '1.4s' },
  { left: '62%', duration: '6s', delay: '0.6s' },
  { left: '81%', duration: '8s', delay: '2.2s' },
  { left: '45%', duration: '9s', delay: '3s' },
];

export function SplashDroplets() {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {/* Static clinging droplets */}
      <svg
        className="absolute inset-0 block h-full w-full"
        viewBox="0 0 760 520"
        preserveAspectRatio="none"
      >
        {DROPLETS.map((d, i) => (
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
        ))}
      </svg>

      {/* Running water streaks — hidden under reduced-motion / low-perf */}
      {STREAKS.map((s, i) => (
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
      ))}
    </div>
  );
}
