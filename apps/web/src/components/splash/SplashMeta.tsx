interface SplashMetaProps {
  /** App version string from useAppVersionQuery. */
  version: string;
  /** Locale-formatted current time. */
  clock: string;
}

/**
 * Top-right meta corner — real `v{version}` + live clock.
 *
 * Replaces the mock's hardcoded `v0.19 · LATE NIGHT BUILD` / `03:14 a.m.` with
 * real data: the version comes from useAppVersionQuery (via useSplashScreen)
 * and the clock is locale-formatted via Intl and ticks each minute. No dev
 * label. Static — no animation.
 *
 * Mock literal mapping: clock accent `oklch(0.85 0.14 295 / 0.8)` -> `--primary`.
 */
export function SplashMeta({ version, clock }: SplashMetaProps) {
  return (
    <div
      className="absolute right-[30px] top-[26px] z-30 select-none text-right font-mono text-[9px] uppercase tracking-[0.22em]"
      aria-hidden="true"
    >
      <div style={{ color: 'oklch(from var(--muted-foreground) l c h / 0.85)' }}>
        {version ? `v${version} · 白波` : '白波'}
      </div>
      <div className="mt-1" style={{ color: 'oklch(from var(--primary) l c h / 0.8)' }}>
        {clock}
      </div>
    </div>
  );
}
