import type { ISettingsHeaderProps, ISettingsHeaderView } from './SettingsHeader.types';

/**
 * SettingsHeader is a pure presentational wrapper around `PageHeader`; the hook
 * simply forwards its visual props so the shell stays a thin, logic-free render.
 */
export function useSettingsHeader({
  icon,
  title,
  subtitle,
}: ISettingsHeaderProps): ISettingsHeaderView {
  return { icon, title, subtitle };
}
