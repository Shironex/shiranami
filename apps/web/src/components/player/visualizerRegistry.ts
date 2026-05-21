import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { VisualizerStyle } from '@/stores/useUIStore';
import type { FrequencySource } from './visualizer-source';

/**
 * Single source of truth for the visualizer style → component mapping and the
 * ordered settings list. Replaces the style ternaries previously duplicated in
 * App.tsx and VisualizerStylePreview.tsx and the option array in
 * VisualizerSection.tsx.
 *
 * Each component keeps its own code-split chunk via `lazy()` — only the
 * selected visualizer's chunk loads.
 */

export interface VisualizerComponentProps {
  source?: FrequencySource;
  active?: boolean;
}

export const VISUALIZER_COMPONENTS: Record<
  VisualizerStyle,
  LazyExoticComponent<ComponentType<VisualizerComponentProps>>
> = {
  bars: lazy(() => import('./AudioVisualizer')),
  waveform: lazy(() => import('./WaveformVisualizer')),
  circle: lazy(() => import('./CircleVisualizer')),
  particles: lazy(() => import('./ParticleVisualizer')),
};

export interface VisualizerStyleMeta {
  value: VisualizerStyle;
  labelKey: string;
  descKey: string;
}

/** Ordered list driving the settings grid (design display order). */
export const VISUALIZER_STYLES: ReadonlyArray<VisualizerStyleMeta> = [
  { value: 'bars', labelKey: 'vis.bars', descKey: 'vis.barsDesc' },
  { value: 'waveform', labelKey: 'vis.waveform', descKey: 'vis.waveformDesc' },
  { value: 'circle', labelKey: 'vis.circle', descKey: 'vis.circleDesc' },
  { value: 'particles', labelKey: 'vis.particles', descKey: 'vis.particlesDesc' },
];
