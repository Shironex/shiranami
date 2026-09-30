import { useTranslation } from 'react-i18next';
import type { IAmbienceSectionView } from './AmbienceSection.types';

export function useAmbienceSection(): IAmbienceSectionView {
  const { t } = useTranslation('ambience');
  return {
    title: t('title'),
    subtitle: t('section.subtitle'),
    sleepNote: t('section.sleepNote'),
    credit: t('section.credit'),
  };
}
