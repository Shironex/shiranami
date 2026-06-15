import { useTranslation } from 'react-i18next';
import { confidenceLevel, type ConfidenceLevel } from '@/lib/enrichConfidence';
import type {
  IEnrichConfidenceBadgeProps,
  IEnrichConfidenceBadgeView,
} from './EnrichConfidenceBadge.types';

// Token-backed colors — High = success green, Med = warning amber, Low = danger red.
const LEVEL_CLASSES: Record<ConfidenceLevel, string> = {
  high: 'bg-[rgba(var(--status-success-rgb),0.12)] text-emerald-300 border-emerald-400/25',
  med: 'bg-[rgba(var(--status-warning-rgb),0.12)] text-amber-300 border-amber-400/25',
  low: 'bg-destructive/10 text-destructive border-destructive/25',
};

const LEVEL_I18N_KEY: Record<ConfidenceLevel, string> = {
  high: 'lib.enrichConfidenceHigh',
  med: 'lib.enrichConfidenceMed',
  low: 'lib.enrichConfidenceLow',
};

const EMPTY_LEVEL = '' satisfies string;

/**
 * Resolves the raw confidence score into the coarse level, then maps it to the
 * badge's token-backed color classes and localized label. Returns `visible:
 * false` when there is no score so the shell can render nothing.
 */
export function useEnrichConfidenceBadge({
  confidence,
  className,
}: IEnrichConfidenceBadgeProps): IEnrichConfidenceBadgeView {
  const { t } = useTranslation('settings');
  const level = confidenceLevel(confidence);

  if (!level) {
    return { visible: false, levelClassName: EMPTY_LEVEL, label: EMPTY_LEVEL, className };
  }

  return {
    visible: true,
    levelClassName: LEVEL_CLASSES[level],
    label: t(LEVEL_I18N_KEY[level]),
    className,
  };
}
