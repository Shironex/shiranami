import { useTranslation } from 'react-i18next';
import { HISTORY_RANGES, getRangeCopy } from '@/components/history/historyUtils';
import type {
  IHistoryHeroSectionProps,
  IHistoryHeroSectionView,
  IHistoryRangeOption,
} from './HistoryHeroSection.types';

export function useHistoryHeroSection({
  selectedRange,
  onRangeChange,
}: IHistoryHeroSectionProps): IHistoryHeroSectionView {
  const { t } = useTranslation('history');

  const ranges: IHistoryRangeOption[] = HISTORY_RANGES.map(range => ({
    id: range.id,
    label: t(range.labelKey),
    isActive: selectedRange === range.id,
  }));

  return {
    eyebrow: t('listeningHistory'),
    title: t('heroTitle'),
    subtitle: t('heroSubtitle', { range: getRangeCopy(selectedRange).toLowerCase() }),
    ranges,
    onSelectRange: onRangeChange,
  };
}
