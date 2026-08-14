import { useTranslation } from 'react-i18next';
import {
  useSanctuaryStore,
  SANCTUARY_AUTO_ENTER_MIN_MINUTES,
  SANCTUARY_AUTO_ENTER_MAX_MINUTES,
  SANCTUARY_ROTATE_MIN_MINUTES,
  SANCTUARY_ROTATE_MAX_MINUTES,
  SANCTUARY_VARIANT_CYCLE,
  type SanctuaryClockFace,
  type SanctuaryClockFormat,
  type SanctuaryRotation,
} from '@/stores/useSanctuaryStore';
import type { ISanctuarySectionView } from './SanctuarySection.types';

const CLOCK_FACE_ORDER: SanctuaryClockFace[] = ['minimal', 'serif', 'oversized'];
const CLOCK_FORMAT_ORDER: SanctuaryClockFormat[] = ['system', '12h', '24h'];
const ROTATION_ORDER: SanctuaryRotation[] = ['off', 'minutes', 'entry'];

export function useSanctuarySection(): ISanctuarySectionView {
  const { t } = useTranslation('settings');
  const variant = useSanctuaryStore(s => s.sanctuaryVariant);
  const setVariant = useSanctuaryStore(s => s.setSanctuaryVariant);
  const trackInfo = useSanctuaryStore(s => s.sanctuaryTrackInfo);
  const setTrackInfo = useSanctuaryStore(s => s.setSanctuaryTrackInfo);
  const timeOfDay = useSanctuaryStore(s => s.sanctuaryTimeOfDay);
  const setTimeOfDay = useSanctuaryStore(s => s.setSanctuaryTimeOfDay);
  const rotation = useSanctuaryStore(s => s.sanctuaryRotation);
  const setRotation = useSanctuaryStore(s => s.setSanctuaryRotation);
  const rotationMinutes = useSanctuaryStore(s => s.sanctuaryRotationMinutes);
  const setRotationMinutes = useSanctuaryStore(s => s.setSanctuaryRotationMinutes);
  const clockFace = useSanctuaryStore(s => s.sanctuaryClockFace);
  const setClockFace = useSanctuaryStore(s => s.setSanctuaryClockFace);
  const clockFormat = useSanctuaryStore(s => s.sanctuaryClockFormat);
  const setClockFormat = useSanctuaryStore(s => s.setSanctuaryClockFormat);
  const clockSeconds = useSanctuaryStore(s => s.sanctuaryClockSeconds);
  const setClockSeconds = useSanctuaryStore(s => s.setSanctuaryClockSeconds);
  const autoEnter = useSanctuaryStore(s => s.sanctuaryAutoEnter);
  const setAutoEnter = useSanctuaryStore(s => s.setSanctuaryAutoEnter);
  const minutes = useSanctuaryStore(s => s.sanctuaryAutoEnterMinutes);
  const setMinutes = useSanctuaryStore(s => s.setSanctuaryAutoEnterMinutes);

  const variantOptions = SANCTUARY_VARIANT_CYCLE.map(value => ({
    value,
    label: t(`app.sanctuary.variant.${value}`),
    isActive: variant === value,
  }));

  const trackInfoOptions = SANCTUARY_VARIANT_CYCLE.map(value => ({
    value,
    label: t(`app.sanctuary.variant.${value}`),
    isShown: trackInfo[value],
  }));

  const clockFaceOptions = CLOCK_FACE_ORDER.map(value => ({
    value,
    label: t(`app.sanctuary.clockFace.${value}`),
    isActive: clockFace === value,
  }));

  return {
    title: t('app.sanctuary.title'),
    subtitle: t('app.sanctuary.desc'),

    variantTitle: t('app.sanctuary.variantTitle'),
    variantDescription: t('app.sanctuary.variantDesc'),
    variantOptions,
    // Under follow-the-day the hour owns the stage; the chips read but don't write.
    variantsDisabled: timeOfDay,
    onSelectVariant: setVariant,

    trackInfoTitle: t('app.sanctuary.trackInfoTitle'),
    trackInfoDescription: t('app.sanctuary.trackInfoDesc'),
    trackInfoOptions,
    onToggleTrackInfo: v => setTrackInfo(v, !trackInfo[v]),

    timeOfDayLabel: t('app.sanctuary.timeOfDay'),
    timeOfDayDescription: t('app.sanctuary.timeOfDayDesc'),
    timeOfDay,
    onTimeOfDayChange: setTimeOfDay,

    rotationLabel: t('app.sanctuary.rotationTitle'),
    rotationDescription: t('app.sanctuary.rotationDesc'),
    rotation,
    rotationOptions: ROTATION_ORDER.map(value => ({
      value,
      label: t(`app.sanctuary.rotation.${value}`),
    })),
    rotationDisabled: timeOfDay,
    onRotationChange: value => setRotation(value as SanctuaryRotation),
    showRotationMinutes: rotation === 'minutes' && !timeOfDay,
    rotationMinutesTitle: t('app.sanctuary.rotationMinutesTitle'),
    rotationMinutesDescription: t('app.sanctuary.rotationMinutesDesc'),
    rotationMinutesLabel: t('app.sanctuary.minutes', { count: rotationMinutes }),
    rotationMinutes,
    rotationMinutesMin: SANCTUARY_ROTATE_MIN_MINUTES,
    rotationMinutesMax: SANCTUARY_ROTATE_MAX_MINUTES,
    onRotationMinutesChange: setRotationMinutes,

    clockFaceTitle: t('app.sanctuary.clockFaceTitle'),
    clockFaceDescription: t('app.sanctuary.clockFaceDesc'),
    clockFaceOptions,
    onSelectClockFace: setClockFace,
    clockFormatLabel: t('app.sanctuary.clockFormatTitle'),
    clockFormatDescription: t('app.sanctuary.clockFormatDesc'),
    clockFormat,
    clockFormatOptions: CLOCK_FORMAT_ORDER.map(value => ({
      value,
      label: t(`app.sanctuary.clockFormat.${value}`),
    })),
    onClockFormatChange: value => setClockFormat(value as SanctuaryClockFormat),
    clockSecondsLabel: t('app.sanctuary.clockSeconds'),
    clockSecondsDescription: t('app.sanctuary.clockSecondsDesc'),
    clockSeconds,
    onClockSecondsChange: setClockSeconds,

    autoEnterLabel: t('app.sanctuary.autoEnter'),
    autoEnterDescription: t('app.sanctuary.autoEnterDesc'),
    autoEnter,
    onAutoEnterChange: setAutoEnter,

    minutesTitle: t('app.sanctuary.minutesTitle'),
    minutesDescription: t('app.sanctuary.minutesDesc'),
    minutesLabel: t('app.sanctuary.minutes', { count: minutes }),
    minutes,
    minutesMin: SANCTUARY_AUTO_ENTER_MIN_MINUTES,
    minutesMax: SANCTUARY_AUTO_ENTER_MAX_MINUTES,
    onMinutesChange: setMinutes,
  };
}
