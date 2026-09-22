import { useTranslation } from 'react-i18next';
import { useCurrentHour } from '@/hooks/useCurrentHour';
import {
  gradeForStopKey,
  roomLightLayerStyle,
  roomLightStopKeyForHour,
} from '@/hooks/useRoomLight';
import { useUIStore } from '@/stores/useUIStore';
import type { IRoomLightPreviewProps, IRoomLightPreviewView } from './RoomLightPreview.types';

/**
 * Resolves the room-light preview's layer variables from the live settings —
 * the same builder AmbientBackground uses, so what the sample shows is
 * pixel-identical to what the scene will paint. `auto` resolves against the
 * current clock, and the status line names the stop actually shown.
 */
export function useRoomLightPreview({ enabled }: IRoomLightPreviewProps): IRoomLightPreviewView {
  const { t } = useTranslation('settings');
  const hour = useCurrentHour();
  const stop = useUIStore(s => s.roomLightStop);
  const intensity = useUIStore(s => s.roomLightIntensity);
  const hueShift = useUIStore(s => s.roomLightHueShift);

  const shownStop = stop === 'auto' ? roomLightStopKeyForHour(hour) : stop;

  return {
    title: t('app.effectPreview.roomLight'),
    layerStyle: enabled
      ? roomLightLayerStyle(gradeForStopKey(shownStop), { intensity, hueShift })
      : null,
    statusLabel: enabled
      ? `${t(`app.roomLightStops.${shownStop}`)} · ${intensity}%`
      : t('app.effectPreview.roomLightOff'),
  };
}
