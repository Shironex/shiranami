import { useTranslation } from 'react-i18next';
import { pad2 } from '@shiranami/shared';
import { formatPeakWindow, getWeekdayShortNames, type HeatLevel } from '../overviewUtils';
import type {
  IHeatmapLegendSwatch,
  IHeatmapRowView,
  IListeningClockProps,
  IListeningClockView,
} from './ListeningClock.types';

/** Hour ticks shown above the grid. */
const HOUR_TICKS = ['00', '06', '12', '18', '24'];

/** Per-level background — all derived from `--primary` so every theme re-tints. */
const LEVEL_CLASS: Record<HeatLevel, string> = {
  0: 'bg-foreground/5',
  1: 'bg-primary/25',
  2: 'bg-primary/45',
  3: 'bg-primary/65',
  4: 'bg-primary/90',
};

const LEGEND_LEVELS: HeatLevel[] = [0, 1, 2, 3, 4];

export function useListeningClock({ heatmap }: IListeningClockProps): IListeningClockView {
  const { t, i18n } = useTranslation('overview');
  const days = getWeekdayShortNames(i18n.language);

  const rows: IHeatmapRowView[] = heatmap.cells.map((row, rowIndex) => ({
    key: rowIndex,
    dayLabel: days[rowIndex] ?? '',
    cells: row.map(cell => ({
      hour: cell.hour,
      level: cell.level,
      levelClass: LEVEL_CLASS[cell.level],
      // Non-color cue: a faint ring on the busiest cells so intensity is not
      // conveyed by shade alone.
      emphasized: cell.level >= 3,
      title: t('heatmap.cellLabel', {
        day: days[rowIndex],
        hour: `${pad2(cell.hour)}:00`,
        level: t(`heatmap.level.${cell.level}`),
        count: cell.playCount,
      }),
    })),
  }));

  const legendSwatches: IHeatmapLegendSwatch[] = LEGEND_LEVELS.map(level => ({
    level,
    levelClass: LEVEL_CLASS[level],
  }));

  const peakLabel =
    heatmap.peakHour !== null
      ? t('heatmap.loudest', { range: formatPeakWindow(heatmap.peakHour) })
      : t('heatmap.loudestNone');

  return {
    title: t('listeningClock', { em: t('listeningClockEm') }),
    rangeLabel: t('last7Days'),
    hasData: heatmap.hasData,
    emptyCopy: t('heatmap.empty'),
    gridAriaLabel: t('heatmap.ariaLabel', { total: heatmap.totalPlays }),
    hourTicks: HOUR_TICKS,
    rows,
    legendSwatches,
    legendQuiet: t('heatmap.legendQuiet'),
    legendLoud: t('heatmap.legendLoud'),
    peakLabel,
  };
}
