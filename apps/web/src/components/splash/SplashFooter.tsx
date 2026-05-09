import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SplashMessageKey, SplashVariant } from '@/hooks/useSplashScreen';

interface SplashFooterProps {
  showStatus: boolean;
  variant: SplashVariant;
  messageKey: SplashMessageKey;
  error?: string | null;
}

/**
 * Status row + bottom rail.
 *
 * Status row: glowing primary dot + rotating i18n message (or error message
 * + retry button in the error variant).
 *
 * Bottom rail: thin border divider, copyright left, 3-band EQ glyph right.
 * The EQ glyph reuses the existing eq-bar-1/2/3 Tailwind utilities — the
 * same visual idiom as the player bar, building a visual rhyme between splash
 * and the running app.
 */
export function SplashFooter({ showStatus, variant, messageKey, error }: SplashFooterProps) {
  const { t } = useTranslation('splash');

  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-col">
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
                  animation: 'shiranami-dot-pulse 1.4s ease-in-out infinite',
                }}
                aria-hidden="true"
              />
              <p className="text-destructive text-[11.5px] font-sans">{error ?? t('tryAgain')}</p>
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
                boxShadow: '0 0 8px oklch(from var(--primary) l c h / 0.7)',
                animation: 'shiranami-dot-pulse 1.4s ease-in-out infinite',
              }}
              aria-hidden="true"
            />
            <p
              key={messageKey}
              className="text-muted-foreground text-[11.5px] font-sans"
              style={{ animation: 'shiranami-msg-fade 320ms ease-out both' }}
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

        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40 mr-1.5 select-none">
            now spinning
          </span>
          {/* EQ glyph — reuses player bar idiom */}
          <div className="flex items-end gap-[2px] h-3">
            <span
              className="block w-[3px] rounded-sm bg-primary/70 origin-bottom eq-bar-1"
              style={{ height: '100%' }}
            />
            <span
              className="block w-[3px] rounded-sm bg-primary/70 origin-bottom eq-bar-2"
              style={{ height: '100%' }}
            />
            <span
              className="block w-[3px] rounded-sm bg-primary/70 origin-bottom eq-bar-3"
              style={{ height: '100%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
