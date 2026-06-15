import { useTranslation } from 'react-i18next';
import type { IToolStatusRowProps, IToolStatusRowView } from './ToolStatusRow.types';

/**
 * Binds the `settings` translator and forwards the row's visual props so the
 * shell renders pre-resolved status labels and stays free of `useTranslation`.
 */
export function useToolStatusRow({
  installed,
  installedTitle,
  notInstalledTitle,
  updateAvailable,
  notInstalledRight,
}: IToolStatusRowProps): IToolStatusRowView {
  const { t } = useTranslation('settings');

  return {
    installed,
    installedTitle,
    notInstalledTitle,
    updateAvailable,
    notInstalledRight,
    updateAvailableLabel: t('dl.updateAvailable'),
    upToDateLabel: t('dl.upToDate'),
  };
}
