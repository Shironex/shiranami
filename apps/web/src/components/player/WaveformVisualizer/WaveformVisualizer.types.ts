import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface IWaveformVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface IWaveformVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
