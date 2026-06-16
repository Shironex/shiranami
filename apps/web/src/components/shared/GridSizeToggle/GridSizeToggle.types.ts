import type { LucideIcon } from 'lucide-react';

export type GridSize = 'small' | 'medium' | 'large';

export interface IGridSizeToggleLabels {
  readonly group: string;
  readonly small: string;
  readonly medium: string;
  readonly large: string;
}

export interface IGridSizeToggleProps {
  readonly size: GridSize;
  readonly onSizeChange: (size: GridSize) => void;
  readonly labels: IGridSizeToggleLabels;
}

export interface IGridSizeOption {
  readonly size: GridSize;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly active: boolean;
}

export interface IGridSizeToggleView {
  /** The grid-size options, in display order (large → medium → small). */
  readonly options: readonly IGridSizeOption[];
}
