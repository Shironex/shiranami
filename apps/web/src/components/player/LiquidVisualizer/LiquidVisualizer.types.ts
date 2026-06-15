import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface ILiquidVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface ILiquidVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
