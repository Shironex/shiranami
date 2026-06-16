import type { IStatusCardProps, IStatusCardView } from './StatusCard.types';

/**
 * StatusCard is a pure presentational component; the hook forwards its visual
 * props and resolves the two derived flags (`isError`, `showBadge`) so the
 * shell stays a thin, logic-free render.
 */
export function useStatusCard({
  title,
  description,
  badgeIcon,
  variant = 'default',
  loading = false,
  children,
}: IStatusCardProps): IStatusCardView {
  return {
    title,
    description,
    badgeIcon,
    loading,
    children,
    isError: variant === 'destructive',
    showBadge: loading || !!badgeIcon,
  };
}
