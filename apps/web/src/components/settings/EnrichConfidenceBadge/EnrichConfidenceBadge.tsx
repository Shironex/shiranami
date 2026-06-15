import { cn } from '@/lib/utils';
import { useEnrichConfidenceBadge } from './EnrichConfidenceBadge.hooks';
import type { IEnrichConfidenceBadgeProps } from './EnrichConfidenceBadge.types';

/**
 * Tiny pill showing how confident a metadata match is. Surfaces the score the
 * lookup already computes but used to discard — lets the user spot a dubious
 * match before (and after) it lands.
 */
export default function EnrichConfidenceBadge(props: IEnrichConfidenceBadgeProps) {
  const { visible, levelClassName, label, className } = useEnrichConfidenceBadge(props);
  if (!visible) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center shrink-0 px-1.5 py-0.5 rounded-full border',
        'text-[10px] font-semibold uppercase tracking-[0.08em] leading-none',
        levelClassName,
        className
      )}
    >
      {label}
    </span>
  );
}
