import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface IKanjiVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface IKanjiVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
