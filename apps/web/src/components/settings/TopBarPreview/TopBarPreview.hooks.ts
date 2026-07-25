import { useTranslation } from 'react-i18next';
import type { ITopBarPreviewProps, ITopBarPreviewView } from './TopBarPreview.types';

/**
 * TopBarPreview is a presentational mock; the hook resolves the localized
 * caption and forwards the visibility flag so the shell stays a thin,
 * logic-free render.
 */
export function useTopBarPreview({ enabled }: ITopBarPreviewProps): ITopBarPreviewView {
  const { t } = useTranslation('settings');

  return {
    title: t('app.interface.topBarPreview'),
    enabled,
  };
}
