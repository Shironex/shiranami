import { useTranslation } from 'react-i18next';
import type {
  ILowPerformancePreviewProps,
  ILowPerformancePreviewView,
} from './LowPerformancePreview.types';

/** Fixed bar heights (px) for the low-performance equalizer mock. */
const LOW_PERF_BAR_HEIGHTS = [32, 58, 42, 76, 48, 68, 38, 56] as const;

/**
 * Resolves the low-performance preview's localized status line and badge, so
 * the shell only paints the equalizer mock behind them.
 */
export function useLowPerformancePreview({
  enabled,
}: ILowPerformancePreviewProps): ILowPerformancePreviewView {
  const { t } = useTranslation('settings');

  return {
    title: t('app.effectPreview.performance'),
    enabled,
    statusLabel: enabled
      ? t('app.effectPreview.performanceOn')
      : t('app.effectPreview.performanceOff'),
    badgeLabel: enabled ? t('app.effectPreview.reduced') : t('app.effectPreview.full'),
    barHeights: LOW_PERF_BAR_HEIGHTS,
  };
}
