import type { ComponentType, LazyExoticComponent } from 'react';
import type { VisualizerComponentProps } from '@/components/player/visualizerRegistry';
import type { FrequencySource } from '@/components/player/visualizer-source';

export interface IVisualizerStylePreviewView {
  /** Localized preview title shown above the canvas. */
  readonly title: string;
  /** The lazy visualizer component for the currently-selected style. */
  readonly Visualizer: LazyExoticComponent<ComponentType<VisualizerComponentProps>>;
  /** Stable synthetic frequency source that animates the preview. */
  readonly source: FrequencySource;
}
