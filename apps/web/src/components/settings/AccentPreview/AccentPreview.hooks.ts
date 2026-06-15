import { useTranslation } from 'react-i18next';
import type { IAccentPreviewView } from './AccentPreview.types';

export function useAccentPreview(): IAccentPreviewView {
  const { t } = useTranslation('settings');

  return {
    title: t('app.accent.previewTitle'),
  };
}
