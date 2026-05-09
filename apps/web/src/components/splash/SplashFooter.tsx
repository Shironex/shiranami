import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SplashMessageKey, SplashVariant } from '@/hooks/useSplashScreen';

interface SplashFooterProps {
  showStatus: boolean;
  variant: SplashVariant;
  messageKey: SplashMessageKey;
  error?: string | null;
  /** App version string — rendered as `v{version} · 白波` on the right rail. */
  version: string;
  reducedMotion: boolean;
}

/**
 * Status row + bottom rail for the cafe-window splash.
 *
 * Status row: single primary glowing dot + rotating i18n message (or error
 * message + retry button in the error variant). The dot is the only --primary
 * element on the entire splash.
 *
 * Bottom rail: thin border divider, copyright left, `v{version} · 白波` right
 * in the same mono uppercase tracked treatment. No EQ glyph — the rain owns
 * the motion; a pulsing EQ bar would compete with its slower vertical rhythm.
 *
 * Footer sits above the rain canvas (z-order enforced by parent stacking).
 */
export function SplashFooter({
  showStatus,
  variant,
  messageKey,
  error,
  version,
  reducedMotion,
}: SplashFooterProps) {
  const { t } = useTranslation('splash');

  const statusDotAnimation = reducedMotion
    ? undefined
    : 'shiranami-dot-pulse 1.4s ease-in-out infinite';

  const msgAnimation = reducedMotion
    ? undefined
    : 'shiranami-msg-fade 320ms ease-out both';

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col">
      {/* Status row */}
      <div
        className={cn(
          'flex items-center justify-center gap-2.5 pb-8 transition-opacity duration-500 ease-in',
          showStatus ? 'opacity-100' : 'opacity-0'
        )}
        role="status"
        aria-live="polite"
      >
        {variant === 'error' ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  background: 'var(--destructive)',
                  boxShadow: '0 0 8px oklch(from var(--destructive) l c h / 0.7)',
                  animation: statusDotAnimation,
                }}
                aria-hidden="true"
              />
              <p
                className="text-[11.5px] font-sans"
                style={{ color: 'oklch(from var(--destructive) l c h / 0.9)' }}
              >
                {error ?? t('tryAgain')}
              </p>
            </div>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto cursor-pointer p-0 text-sm no-drag"
              onClick={() => window.location.reload()}
            >
              {t('tryAgain')}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                background: 'var(--primary)',
                boxShadow: '0 0 8px oklch(from var(--primary) l c h / 0.55)',
                animation: statusDotAnimation,
              }}
              aria-hidden="true"
            />
            <p
              key={messageKey}
              className="text-[11.5px] font-sans"
              style={{
                color: 'oklch(from var(--muted-foreground) l c h / 0.85)',
                animation: msgAnimation,
              }}
            >
              {t(messageKey)}
            </p>
          </div>
        )}
      </div>

      {/* Bottom rail */}
      <div
        className="border-t flex items-center justify-between px-5 py-2.5"
        style={{ borderColor: 'var(--border-strong)' }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 select-none">
          © 2026 · 白波 shiranami
        </span>

        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40 select-none">
          {version ? `v${version} · 白波` : '白波'}
        </span>
      </div>
    </div>
  );
}
