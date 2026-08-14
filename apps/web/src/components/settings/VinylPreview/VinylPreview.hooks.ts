import { useTranslation } from 'react-i18next';
import type { IVinylPreviewProps, IVinylPreviewView } from './VinylPreview.types';

/**
 * VinylPreview shows a live miniature of the actual VinylRecord component; the
 * hook resolves the localized caption and forwards the toggle so the shell
 * stays a thin render.
 */
export function useVinylPreview({ enabled }: IVinylPreviewProps): IVinylPreviewView {
  const { t } = useTranslation('settings');

  return {
    title: t('app.effectPreview.vinyl'),
    enabled,
  };
}
