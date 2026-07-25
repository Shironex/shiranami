import type { IHistoryStatCardProps, IHistoryStatCardView } from './HistoryStatCard.types';

/**
 * HistoryStatCard is purely presentational — HistoryView's hook has already
 * localized and formatted every figure — so this hook only forwards the copy and
 * renames `icon` to the capitalized `Icon` the shell renders, keeping the shell
 * free of even that aliasing.
 */
export function useHistoryStatCard({
  label,
  value,
  hint,
  icon: Icon,
}: IHistoryStatCardProps): IHistoryStatCardView {
  return { label, value, hint, Icon };
}
