import type { CSSProperties, ComponentType } from 'react';
import type { VisualizerComponentProps } from '@/components/player/visualizerRegistry';

export interface IVisualizerStripView {
  /** The lazy visualizer component for the active style. */
  readonly Visualizer: ComponentType<VisualizerComponentProps>;
  /** Absolute-positioning style for the strip (height + top/bottom docking). */
  readonly containerStyle: CSSProperties;
}
