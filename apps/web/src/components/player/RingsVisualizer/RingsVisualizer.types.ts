import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface IRingsVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface IRingsVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
