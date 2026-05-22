import { Coffee, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BUY_ME_A_COFFEE_URL } from '@/lib/constants';
import { useSupportBannerStore } from '@/stores/useSupportBannerStore';

/**
 * Thin, dismissible top-strip launch banner pointing to Buy Me a Coffee.
 * Shown once ever (the `seen` flag persists to localStorage + electron-store);
 * mounting it inside App's post-onboarding block already gates it to first-run
 * users who have finished the wizard. Acting on the link or dismissing both
 * mark it seen so it never returns.
 */
export function SupportBanner() {
  const { t } = useTranslation('settings');
  const seen = useSupportBannerStore(s => s.seen);
  const setSeen = useSupportBannerStore(s => s.setSeen);

  if (seen) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-slide-down relative z-[1] flex items-center justify-center gap-2 border-b border-border/40 bg-card/90 px-3 py-1.5 text-xs text-foreground backdrop-blur-md"
    >
      <Coffee className="size-3.5 text-primary" aria-hidden="true" />
      <span>{t('supportBanner.message')}</span>
      <a
        href={BUY_ME_A_COFFEE_URL}
        target="_blank"
        rel="noreferrer"
        onClick={setSeen}
        className="ml-1 rounded px-1.5 py-0.5 font-medium text-primary underline underline-offset-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {t('supportBanner.action')}
      </a>
      <button
        type="button"
        onClick={setSeen}
        aria-label={t('supportBanner.dismiss')}
        className="ml-1 grid place-items-center rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
