import { useSplashMeta } from './SplashMeta.hooks';
import type { ISplashMetaProps } from './SplashMeta.types';

/**
 * Top-right meta corner — real `v{version}` + live clock.
 *
 * The version comes from useAppVersionQuery (via useSplashScreen) and the clock
 * is locale-formatted via Intl and ticks each minute. No dev label. Static — no
 * animation.
 *
 * Mock literal mapping: clock accent `oklch(0.85 0.14 295 / 0.8)` -> `--primary`.
 */
export default function SplashMeta(props: ISplashMetaProps) {
  const { buildLabel, clock } = useSplashMeta(props);

  return (
    <div
      className="absolute right-[30px] top-[26px] z-30 select-none text-right font-mono text-[9px] uppercase tracking-[0.22em]"
      aria-hidden="true"
    >
      <div style={{ color: 'oklch(from var(--muted-foreground) l c h / 0.85)' }}>{buildLabel}</div>
      <div className="mt-1" style={{ color: 'oklch(from var(--primary) l c h / 0.8)' }}>
        {clock}
      </div>
    </div>
  );
}
