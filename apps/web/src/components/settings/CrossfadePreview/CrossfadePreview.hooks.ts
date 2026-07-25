import { useTranslation } from 'react-i18next';
import type { ICrossfadePreviewProps, ICrossfadePreviewView } from './CrossfadePreview.types';

/**
 * Resolves the crossfade preview's localized copy plus the incoming-track bar
 * geometry: blending slides it back under the outgoing track and stretches it,
 * a clean cut parks it at the boundary as a hairline.
 */
export function useCrossfadePreview({
  enabled,
  duration,
}: ICrossfadePreviewProps): ICrossfadePreviewView {
  const { t } = useTranslation('settings');

  return {
    title: t('play.crossfadePreview'),
    outgoingLabel: t('play.previewOutgoing'),
    incomingLabel: t('play.previewIncoming'),
    incomingLeft: enabled ? '42%' : '68%',
    incomingWidth: enabled ? '42%' : '0.5rem',
    showBlendGlow: enabled,
    statusLabel: enabled ? t('play.crossfadePreviewBlend') : t('play.crossfadePreviewCut'),
    durationLabel: enabled ? t('play.crossfadePreviewDuration', { seconds: duration }) : '0s',
  };
}
