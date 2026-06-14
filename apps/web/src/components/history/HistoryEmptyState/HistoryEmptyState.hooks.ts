import type { IHistoryEmptyStateProps, IHistoryEmptyStateView } from './HistoryEmptyState.types';

export function useHistoryEmptyState({
  title,
  copy,
}: IHistoryEmptyStateProps): IHistoryEmptyStateView {
  return { title, copy };
}
