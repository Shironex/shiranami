import { Grid2x2, LayoutGrid, Grid3x3 } from 'lucide-react';
import type {
  GridSize,
  IGridSizeOption,
  IGridSizeToggleProps,
  IGridSizeToggleView,
} from './GridSizeToggle.types';

const ORDER: readonly { size: GridSize; icon: typeof Grid2x2 }[] = [
  { size: 'large', icon: Grid2x2 },
  { size: 'medium', icon: LayoutGrid },
  { size: 'small', icon: Grid3x3 },
];

export function useGridSizeToggle({ size, labels }: IGridSizeToggleProps): IGridSizeToggleView {
  const options: IGridSizeOption[] = ORDER.map(entry => ({
    size: entry.size,
    icon: entry.icon,
    label: labels[entry.size],
    active: size === entry.size,
  }));

  return { options };
}
