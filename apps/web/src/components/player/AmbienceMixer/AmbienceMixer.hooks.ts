import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudRain, Coffee, Disc3, Flame, Waves, type LucideIcon } from 'lucide-react';
import {
  AMBIENT_LAYER_IDS,
  AMBIENT_LEVEL_STEP,
  useAmbientStore,
  type AmbientLayerId,
} from '@/stores/useAmbientStore';
import { useWeatherStore } from '@/stores/useWeatherStore';
import type {
  IAmbienceLayerRow,
  IAmbienceMixerProps,
  IAmbienceMixerView,
} from './AmbienceMixer.types';

const LAYER_ICONS: Record<AmbientLayerId, LucideIcon> = {
  rain: CloudRain,
  vinyl: Disc3,
  noise: Waves,
  fire: Flame,
  cafe: Coffee,
};

export function useAmbienceMixer({ inline = false }: IAmbienceMixerProps): IAmbienceMixerView {
  const { t } = useTranslation('ambience');
  const [open, setOpen] = useState(false);
  const baseId = useId();

  const enabled = useAmbientStore(s => s.enabled);
  const levels = useAmbientStore(s => s.levels);
  const keepWhenPaused = useAmbientStore(s => s.keepWhenPaused);
  const followWeather = useAmbientStore(s => s.followWeather);
  const setEnabled = useAmbientStore(s => s.setEnabled);
  const setLevel = useAmbientStore(s => s.setLevel);
  const setKeepWhenPaused = useAmbientStore(s => s.setKeepWhenPaused);
  const setFollowWeather = useAmbientStore(s => s.setFollowWeather);
  const resetLevels = useAmbientStore(s => s.resetLevels);
  const weatherAvailable = useWeatherStore(s => s.enabled);

  const layerRows: IAmbienceLayerRow[] = AMBIENT_LAYER_IDS.map(id => {
    const label = t(`layers.${id}`);
    return {
      id,
      Icon: LAYER_ICONS[id],
      label,
      sliderLabel: t('layerVolume', { layer: label }),
      value: levels[id],
      percentLabel: t('percent', { value: Math.round(levels[id] * 100) }),
    };
  });

  const onLevelChange = useCallback(
    (id: AmbientLayerId, level: number) => setLevel(id, level),
    [setLevel]
  );

  return {
    t,
    inline,
    open,
    setOpen,
    enabled,
    layerRows,
    sliderStep: AMBIENT_LEVEL_STEP,
    keepWhenPaused,
    followWeather,
    weatherAvailable,
    ids: {
      enable: `${baseId}-enable`,
      enableDesc: `${baseId}-enable-desc`,
      keep: `${baseId}-keep`,
      keepDesc: `${baseId}-keep-desc`,
      follow: `${baseId}-follow`,
      followDesc: `${baseId}-follow-desc`,
      layers: `${baseId}-layers`,
    },
    onToggleEnabled: setEnabled,
    onLevelChange,
    onToggleKeepWhenPaused: setKeepWhenPaused,
    onToggleFollowWeather: setFollowWeather,
    onReset: resetLevels,
  };
}
