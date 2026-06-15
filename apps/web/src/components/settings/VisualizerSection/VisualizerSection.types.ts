import type { VisualizerStyle } from '@/stores/useUIStore';
import type { VisualizerPosition } from '@/stores/useLayoutStore';

export interface IVisualizerSectionPositionOption {
  /** Position value passed to the layout store. */
  readonly value: VisualizerPosition;
  /** Localized option label. */
  readonly label: string;
}

export interface IVisualizerSectionView {
  /** Localized card title. */
  readonly title: string;
  /** Localized card subtitle. */
  readonly subtitle: string;

  /** Localized "show visualizer" toggle label. */
  readonly showLabel: string;
  /** Localized "show visualizer" toggle description. */
  readonly showDescription: string;
  /** Whether the visualizer is currently shown. */
  readonly showVisualizer: boolean;
  /** Toggle the visualizer on/off. */
  readonly onToggleVisualizer: () => void;

  /** Localized position-select label. */
  readonly positionLabel: string;
  /** Localized position-select description (varies with low-perf mode). */
  readonly positionDescription: string;
  /** Currently-selected visualizer position. */
  readonly visualizerPosition: VisualizerPosition;
  /** Whether the position select is disabled (low-performance mode). */
  readonly positionDisabled: boolean;
  /** Available position options. */
  readonly positionOptions: readonly IVisualizerSectionPositionOption[];
  /** Set the visualizer position. */
  readonly onPositionChange: (value: string) => void;

  /** Localized "style" group label. */
  readonly styleLabel: string;
  /** Currently-selected visualizer style. */
  readonly visualizerStyle: VisualizerStyle;
  /** Set the visualizer style. */
  readonly onStyleChange: (style: VisualizerStyle) => void;
}
