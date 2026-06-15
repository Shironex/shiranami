import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface IMountainVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface IMountainVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
