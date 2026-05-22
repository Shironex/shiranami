import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { confidenceLevel, type ConfidenceLevel } from '@/lib/enrichConfidence';

interface EnrichConfidenceBadgeProps {
  /** Raw confidence score (0-1). When undefined/null the badge renders nothing. */
  confidence: number | undefined | null;
  className?: string;
}

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

/**
 * Tiny pill showing how confident a metadata match is. Surfaces the score the
 * lookup already computes but used to discard — lets the user spot a dubious
 * match before (and after) it lands.
 */
export function EnrichConfidenceBadge({ confidence, className }: EnrichConfidenceBadgeProps) {
  const { t } = useTranslation('settings');
  const level = confidenceLevel(confidence);
  if (!level) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center shrink-0 px-1.5 py-0.5 rounded-full border',
        'text-[10px] font-semibold uppercase tracking-[0.08em] leading-none',
        LEVEL_CLASSES[level],
        className
      )}
    >
      {t(LEVEL_I18N_KEY[level])}
    </span>
  );
}
