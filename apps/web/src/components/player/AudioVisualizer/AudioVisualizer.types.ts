import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface IAudioVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface IAudioVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
