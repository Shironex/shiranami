import type { IViewEmptyStateProps, IViewEmptyStateView } from './ViewEmptyState.types';

/**
 * ViewEmptyState is a pure presentational component; the hook forwards its
 * visual props and resolves the two defaults (`variant`, `compact`) plus the
 * derived `isError` flag so the shell stays a thin, logic-free render.
 */
export function useViewEmptyState({
  title,
  subtitle,
  icon,
  hints,
  variant = 'empty',
  action,
  compact = false,
}: IViewEmptyStateProps): IViewEmptyStateView {
  return {
    title,
    subtitle,
    icon,
    hints,
    variant,
    action,
    compact,
    isError: variant === 'error',
  };
}
