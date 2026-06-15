import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface IVuVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface IVuVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
