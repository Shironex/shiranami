import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface IConstellationVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface IConstellationVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
