import { useTranslation } from 'react-i18next';
import {
  useSanctuaryStore,
  SANCTUARY_AUTO_ENTER_MIN_MINUTES,
  SANCTUARY_AUTO_ENTER_MAX_MINUTES,
  type SanctuaryVariant,
} from '@/stores/useSanctuaryStore';
import type { ISanctuarySectionView } from './SanctuarySection.types';

const VARIANT_ORDER: SanctuaryVariant[] = ['cover', 'clock'];

export function useSanctuarySection(): ISanctuarySectionView {
  const { t } = useTranslation('settings');
  const variant = useSanctuaryStore(s => s.sanctuaryVariant);
  const setVariant = useSanctuaryStore(s => s.setSanctuaryVariant);
  const autoEnter = useSanctuaryStore(s => s.sanctuaryAutoEnter);
  const setAutoEnter = useSanctuaryStore(s => s.setSanctuaryAutoEnter);
  const minutes = useSanctuaryStore(s => s.sanctuaryAutoEnterMinutes);
  const setMinutes = useSanctuaryStore(s => s.setSanctuaryAutoEnterMinutes);

  const variantOptions = VARIANT_ORDER.map(value => ({
    value,
    label: t(`app.sanctuary.variant.${value}`),
    isActive: variant === value,
  }));

  return {
    title: t('app.sanctuary.title'),
    subtitle: t('app.sanctuary.desc'),

    variantTitle: t('app.sanctuary.variantTitle'),
    variantDescription: t('app.sanctuary.variantDesc'),
    variantOptions,
    onSelectVariant: setVariant,

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
