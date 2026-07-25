import { useTranslation } from 'react-i18next';
import type {
  INoiseOverlayPreviewProps,
  INoiseOverlayPreviewView,
} from './NoiseOverlayPreview.types';

/**
 * Resolves the noise-overlay preview's localized status line and whether the
 * grain layer is drawn, so the shell only paints the two stacked surfaces.
 */
export function useNoiseOverlayPreview({
  enabled,
}: INoiseOverlayPreviewProps): INoiseOverlayPreviewView {
  const { t } = useTranslation('settings');

  return {
    title: t('app.effectPreview.noise'),
    showNoiseLayer: enabled,
    statusLabel: enabled ? t('app.effectPreview.noiseOn') : t('app.effectPreview.noiseOff'),
  };
}
