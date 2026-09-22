import { useId } from 'react';
import type { IStatsSectionProps, IStatsSectionView } from './StatsSection.types';

/**
 * StatsSection is purely presentational — HistoryView's hook has already
 * localized every string — so this hook only mints the heading id that wires
 * the section's `aria-labelledby`, resolves the variant default, and renames
 * `icon` to the capitalized `Icon` the shell renders.
 */
export function useStatsSection({
  title,
  icon: Icon,
  caption,
  variant = 'panel',
  children,
}: IStatsSectionProps): IStatsSectionView {
  const headingId = useId();
  return { headingId, title, Icon, caption, isHero: variant === 'hero', children };
}
