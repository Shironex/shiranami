import type { RefObject } from 'react';
import type { FrequencySource } from '../visualizer-source';

export interface IParticleVisualizerProps {
  readonly source?: FrequencySource;
  readonly active?: boolean;
}

export interface IParticleVisualizerView {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
