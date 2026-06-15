import { useTranslation } from 'react-i18next';
import { UI_SCALE_DEFAULT } from '@/stores/useUIStore';
import type { IUiScalePreviewProps, IUiScalePreviewView } from './UiScalePreview.types';

export function useUiScalePreview({ scale }: IUiScalePreviewProps): IUiScalePreviewView {
  const { t } = useTranslation('settings');

  return {
    title: t('app.scalePreview'),
    sampleTitle: t('app.scaleSampleTitle'),
    sampleSubtitle: t('app.scaleSampleSubtitle'),
    baseLabel: t('app.scalePreviewBase', { value: UI_SCALE_DEFAULT }),
    currentLabel: t('app.scalePreviewCurrent', { value: scale }),
    currentFactor: scale / 100,
  };
}
