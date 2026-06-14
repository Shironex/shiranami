import { useTranslation } from 'react-i18next';
import { formatActivityLabel, getRangeCopy } from '@/components/history/historyUtils';
import type {
  IHistoryActivityBar,
  IHistoryActivityGraphProps,
  IHistoryActivityGraphView,
} from './HistoryActivityGraph.types';

function barWidthClassFor(count: number): string {
  if (count <= 10) return 'w-10';
  if (count <= 31) return 'w-7';
  if (count <= 90) return 'w-5';
  return 'w-4';
}

function labelEveryFor(count: number): number {
  if (count <= 10) return 1;
  if (count <= 20) return 2;
  if (count <= 40) return 4;
  return 7;
}

export function useHistoryActivityGraph({
  points,
  range,
}: IHistoryActivityGraphProps): IHistoryActivityGraphView {
  const { t } = useTranslation('history');

  if (points.length === 0) {
    return {
      isEmpty: true,
      emptyTitle: t('noActivityTitle'),
      emptyCopy: t('noActivityCopy', { range: getRangeCopy(range).toLowerCase() }),
      graphAriaLabel: '',
      barWidthClass: barWidthClassFor(0),
      bars: [],
    };
  }

  const maxPlayCount = Math.max(...points.map(point => point.playCount), 1);
  const labelEvery = labelEveryFor(points.length);
  const totalPlays = points.reduce((sum, point) => sum + point.playCount, 0);

  const bars: IHistoryActivityBar[] = points.map((point, index) => {
    const showLabel = index % labelEvery === 0 || index === points.length - 1;
    return {
      date: point.date,
      height: Math.max(10, Math.round((point.playCount / maxPlayCount) * 112)),
      label: showLabel ? formatActivityLabel(point.date) : '',
      isEmpty: point.playCount === 0,
      title: t('activityBarTitle', {
        label: formatActivityLabel(point.date),
        count: point.playCount,
        minutes: Math.round(point.listenedMinutes),
      }),
    };
  });

  return {
    isEmpty: false,
    emptyTitle: '',
    emptyCopy: '',
    graphAriaLabel: t('activityGraphLabel', { days: points.length, total: totalPlays }),
    barWidthClass: barWidthClassFor(points.length),
    bars,
  };
}
