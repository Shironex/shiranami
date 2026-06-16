import type { IPageHeaderProps, IPageHeaderView } from './PageHeader.types';

/**
 * PageHeader is a pure presentational component; the hook forwards its visual
 * props and resolves the `variant` default so the shell stays a thin,
 * logic-free render.
 */
export function usePageHeader({
  title,
  icon,
  subtitle,
  variant = 'page',
}: IPageHeaderProps): IPageHeaderView {
  return { title, icon, subtitle, variant };
}
