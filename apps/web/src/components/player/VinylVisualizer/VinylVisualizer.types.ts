import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface IVinylVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface IVinylVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
