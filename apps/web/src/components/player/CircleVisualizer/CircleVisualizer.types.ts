import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface ICircleVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface ICircleVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
