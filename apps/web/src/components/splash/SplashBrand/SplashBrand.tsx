import { Button } from '@/components/ui/button';
import { useSplashBrand } from './SplashBrand.hooks';
import type { ISplashBrandProps } from './SplashBrand.types';

/**
 * Bottom-left brand block — the app identity + loader.
 *
 * Composes (top to bottom): a pill badge with a pulsing LED, the Instrument
 * Serif italic "Shiranami" wordmark (with `nami` in --primary), the kanji
 * subtitle, a sweep loader bar, and the cycling status line. In the error
 * variant the loader + status are replaced by the error message + retry button.
 *
 * Carries the splash status semantics: `role=status` + `aria-live=polite` on
 * the status region so the rotating message and error are announced.
 *
 * Degradation:
 *  - LED carries `.splash-led` -> static opacity 1 under reduced-motion / low-perf.
 *  - Sweep bar carries `.splash-sweep` -> animation removed (track stays so the
 *    loader still reads as "loading").
 *
 * Mock literal mapping: badge text / LED / `nami` em / kanji subtitle / loader
 * sweep `oklch(0.85 0.14 295)` -> `--primary`.
 */
export default function SplashBrand(props: ISplashBrandProps) {
  const {
    badgeLabel,
    ledAnimation,
    sweepAnimation,
    messageAnimation,
    showStatus,
    statusClassName,
    isError,
    errorMessage,
    retryLabel,
    messageKey,
    statusMessage,
    onRetry,
  } = useSplashBrand(props);

  return (
    <div
      className="absolute bottom-9 left-9 z-30 flex max-w-[min(360px,70vw)] flex-col gap-4"
      role="status"
      aria-live="polite"
    >
      {/* Pill badge + LED */}
      <span
        className="splash-glass-blur inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em]"
        style={{
          background: 'oklch(from var(--background) l c h / 0.7)',
          backdropFilter: 'blur(10px)',
          borderColor: 'oklch(from var(--primary) l c h / 0.25)',
          color: 'var(--primary)',
        }}
      >
        <span
          className="splash-led h-1.5 w-1.5 flex-shrink-0 rounded-full"
          style={{
            background: 'var(--primary)',
            boxShadow: '0 0 12px oklch(from var(--primary) l c h / 0.8)',
            animation: ledAnimation,
          }}
          aria-hidden="true"
        />
        {badgeLabel}
      </span>

      {/* Wordmark — Instrument Serif italic */}
      <h1
        className="m-0 select-none font-serif text-[clamp(40px,7vw,54px)] italic leading-none tracking-[-0.015em]"
        style={{
          color: 'var(--foreground)',
          textShadow: '0 1px 12px oklch(from var(--background) calc(l * 0.4) c h / 0.6)',
        }}
      >
        Shira<em style={{ color: 'var(--primary)' }}>nami</em>
      </h1>

      {/* Kanji subtitle — fixed brand string, kanji glyph is not translated */}
      <span
        className="select-none text-[16px] tracking-[0.05em]"
        style={{
          fontFamily: "'Shippori Mincho', 'Noto Sans JP', 'Hiragino Sans', serif",
          fontWeight: 800,
          color: 'var(--primary)',
          textShadow: '0 0 16px oklch(from var(--primary) l c h / 0.5)',
        }}
      >
        白波 · the white waves
      </span>

      {/* Loader + status (or error + retry) */}
      <div className={statusClassName} aria-hidden={!showStatus}>
        {isError ? (
          <div className="flex flex-col items-start gap-2.5">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{
                  background: 'var(--destructive)',
                  boxShadow: '0 0 8px oklch(from var(--destructive) l c h / 0.7)',
                }}
                aria-hidden="true"
              />
              <p
                className="text-[11.5px] font-sans"
                style={{ color: 'oklch(from var(--destructive) l c h / 0.9)' }}
              >
                {errorMessage}
              </p>
            </div>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="no-drag h-auto cursor-pointer p-0 text-sm"
              onClick={onRetry}
            >
              {retryLabel}
            </Button>
          </div>
        ) : (
          <>
            <div
              className="relative h-0.5 w-[240px] max-w-full overflow-hidden rounded-full"
              style={{ background: 'oklch(from var(--foreground) l c h / 0.08)' }}
              aria-hidden="true"
            >
              <span
                className="splash-sweep absolute inset-y-0 left-0 w-[30%]"
                style={{
                  background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
                  boxShadow: '0 0 12px oklch(from var(--primary) l c h / 0.7)',
                  animation: sweepAnimation,
                }}
              />
            </div>
            <p
              key={messageKey}
              className="font-mono text-[9px] uppercase tracking-[0.22em]"
              style={{
                color: 'oklch(from var(--muted-foreground) l c h / 0.85)',
                animation: messageAnimation,
              }}
            >
              {statusMessage}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
