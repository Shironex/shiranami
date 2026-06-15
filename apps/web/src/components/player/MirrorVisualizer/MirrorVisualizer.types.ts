import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface IMirrorVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface IMirrorVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
