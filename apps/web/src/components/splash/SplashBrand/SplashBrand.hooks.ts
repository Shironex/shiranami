import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ISplashBrandProps, ISplashBrandView } from './SplashBrand.types';

const LED_PULSE = 'splash-led-pulse 1.6s ease-in-out infinite';
const LOADER_SWEEP = 'splash-sweep 1.8s ease-in-out infinite';
const MESSAGE_FADE = 'shiranami-msg-fade 320ms ease-out both';

/**
 * Resolves the brand block's copy, its three motion loops, and the retry
 * handler.
 *
 * The `.splash-led` / `.splash-sweep` classes already degrade via the global
 * reduced-motion and low-perf stylesheet guards; dropping the inline animations
 * here as well keeps the freeze correct even before those rules resolve.
 */
export function useSplashBrand({
  showStatus,
  variant,
  messageKey,
  error,
  reducedMotion,
}: ISplashBrandProps): ISplashBrandView {
  const { t } = useTranslation('splash');

  return {
    badgeLabel: t('badge'),
    ledAnimation: reducedMotion ? undefined : LED_PULSE,
    sweepAnimation: reducedMotion ? undefined : LOADER_SWEEP,
    messageAnimation: reducedMotion ? undefined : MESSAGE_FADE,
    showStatus,
    statusClassName: cn(
      'mt-1.5 flex flex-col gap-2.5 transition-opacity duration-500 ease-in',
      showStatus ? 'opacity-100' : 'opacity-0 pointer-events-none'
    ),
    isError: variant === 'error',
    errorMessage: error ?? t('tryAgain'),
    retryLabel: t('tryAgain'),
    messageKey,
    statusMessage: t(messageKey),
    onRetry: () => window.location.reload(),
  };
}
