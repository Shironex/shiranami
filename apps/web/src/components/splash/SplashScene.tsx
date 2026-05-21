interface SplashSceneProps {
  /** When true, light flicker is suppressed (reduced-motion or low-perf). */
  reducedMotion: boolean;
}

/**
 * Night-scene base behind the wet glass — the view out the cafe window.
 *
 * Full-bleed, static art with a single animated sub-layer (distant warm
 * lights flickering). Composes four conceptual bands, all token-mapped:
 *  - base night gradient + violet sky glow (`--background` / `--primary`)
 *  - skyline silhouette (`--background` darker, hairline `--primary` stroke)
 *  - moon + glow (warm `--favorite`)
 *  - ~15 distant warm window lights (`--favorite`, flicker)
 *
 * Degradation: the lights carry the `.splash-light` class so the global
 * reduced-motion / `[data-perf-mode='low']` guards freeze them at their base
 * opacity. The `reducedMotion` prop additionally drops the inline animation so
 * the freeze holds even before the stylesheet guard resolves. Everything else
 * here is static.
 *
 * Mock literal mapping: violet `oklch(0.32 0.14 305)` sky glow → `--primary`;
 * warm `oklch(0.85 0.12 80/75)` moon + lights → `--favorite`; dark scene base
 * `oklch(0.03–0.07 …)` → `--background`.
 */

// Distant warm window lights — percentage positions mirror the mock's spread
// across the lower-third skyline band. `big` marks the two taller windows.
const LIGHTS: { left: string; top: string; big?: boolean; even?: boolean }[] = [
  { left: '8%', top: '62%' },
  { left: '14%', top: '66%', even: true },
  { left: '18%', top: '60%' },
  { left: '24%', top: '64%', even: true },
  { left: '31%', top: '58%' },
  { left: '36%', top: '62%', big: true, even: true },
  { left: '42%', top: '65%' },
  { left: '48%', top: '63%', even: true },
  { left: '56%', top: '67%' },
  { left: '62%', top: '60%', even: true },
  { left: '68%', top: '64%' },
  { left: '73%', top: '58%', even: true },
  { left: '79%', top: '62%', big: true },
  { left: '86%', top: '66%', even: true },
  { left: '92%', top: '60%' },
];

export function SplashScene({ reducedMotion }: SplashSceneProps) {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {/* Base night gradient + violet sky glow + far-building wash */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(80% 55% at 50% 78%, oklch(from var(--primary) l c h / 0.16), transparent 65%)',
            'radial-gradient(60% 45% at 75% 30%, oklch(from var(--primary) l c h / 0.10), transparent 75%)',
            'linear-gradient(180deg, oklch(from var(--background) l c h / 1) 0%, oklch(from var(--background) calc(l * 0.85) c h / 1) 100%)',
          ].join(', '),
        }}
      />

      {/* Skyline silhouette — full-bleed bottom band, non-uniform scale */}
      <div className="absolute inset-x-0 bottom-0" style={{ height: '34%' }}>
        <svg className="block h-full w-full" viewBox="0 0 760 180" preserveAspectRatio="none">
          <path
            d="M0,180 L0,140 L40,140 L40,110 L80,110 L80,150 L120,150 L120,90 L140,90 L140,70 L180,70 L180,130 L220,130 L220,100 L260,100 L260,80 L300,80 L300,120 L340,120 L340,60 L380,60 L380,90 L420,90 L420,130 L460,130 L460,80 L500,80 L500,110 L540,110 L540,70 L580,70 L580,140 L620,140 L620,100 L660,100 L660,130 L720,130 L720,150 L760,150 L760,180 Z"
            fill="oklch(from var(--background) calc(l * 0.7) c h / 1)"
            stroke="oklch(from var(--primary) l c h / 0.05)"
            strokeWidth="0.5"
          />
        </svg>
      </div>

      {/* Moon + glow — warm --favorite radial */}
      <div
        className="absolute"
        style={{
          left: '76%',
          top: '18%',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 35% 35%, oklch(from var(--favorite) calc(l + 0.2) c h / 0.95) 0%, oklch(from var(--favorite) l c h / 0.55) 60%, transparent 80%)',
          boxShadow:
            '0 0 60px oklch(from var(--favorite) l c h / 0.4), 0 0 120px oklch(from var(--favorite) l c h / 0.18)',
          filter: 'blur(1px)',
        }}
      />

      {/* Distant warm window lights — flicker, degrade to static */}
      <div className="absolute inset-0">
        {LIGHTS.map((light, i) => (
          <span
            key={i}
            className="splash-light absolute"
            style={{
              left: light.left,
              top: light.top,
              width: '3px',
              height: light.big ? '4px' : '3px',
              borderRadius: '1px',
              background: 'oklch(from var(--favorite) l c h / 1)',
              boxShadow: '0 0 6px oklch(from var(--favorite) l c h / 0.6)',
              opacity: 0.7,
              animation: reducedMotion
                ? undefined
                : light.even
                  ? 'flicker 6.2s 0.8s ease-in-out infinite'
                  : 'flicker 4s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    </div>
  );
}
