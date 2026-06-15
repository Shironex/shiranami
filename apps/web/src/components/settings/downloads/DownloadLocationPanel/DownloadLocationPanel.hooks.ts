import { useTranslation } from 'react-i18next';
import type {
  IDownloadLocationPanelProps,
  IDownloadLocationPanelView,
} from './DownloadLocationPanel.types';

/**
 * Binds the `settings` translator and forwards the panel's props so the shell
 * renders pre-resolved labels and stays free of `useTranslation`.
 */
export function useDownloadLocationPanel({
  pathDisplay,
  isDefault,
  updating,
  onChange,
  onReset,
}: IDownloadLocationPanelProps): IDownloadLocationPanelView {
  const { t } = useTranslation('settings');

  return {
    pathDisplay,
    isDefault,
    updating,
    onChange,
    onReset,
    locationLabel: t('dl.location'),
    originBadge: isDefault ? t('dl.default') : t('dl.custom'),
    locationHint: t('dl.locationHint'),
    changeLabel: t('dl.changeLocation'),
    resetLabel: t('dl.resetDefault'),
  };
}
