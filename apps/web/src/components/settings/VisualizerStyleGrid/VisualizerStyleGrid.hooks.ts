import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { VISUALIZER_STYLES } from '@/components/player/visualizerRegistry';
import type {
  IVisualizerStyleGridProps,
  IVisualizerStyleGridView,
} from './VisualizerStyleGrid.types';

export function useVisualizerStyleGrid({
  value,
  onSelect,
  columns = 2,
  compact = false,
}: IVisualizerStyleGridProps): IVisualizerStyleGridView {
  const { t } = useTranslation('settings');

  const tiles = VISUALIZER_STYLES.map(opt => ({
    value: opt.value,
    label: t(opt.labelKey),
    description: t(opt.descKey),
    selected: value === opt.value,
  }));

  return {
    tiles,
    gridClassName: cn('grid gap-3', columns === 3 ? 'grid-cols-3' : 'grid-cols-2'),
    compact,
    onSelect,
  };
}
