import type { RefObject } from 'react';

export interface ISplashRainProps {
  /** Freeze the rain field (error variant — rain pauses but does not disappear). */
  readonly paused: boolean;
  /** Low-performance mode collapses the field to a single static frame. */
  readonly lowPerformanceMode: boolean;
  /** Reduced-motion preference — also collapses the field to a static frame. */
  readonly reducedMotion: boolean;
}

export interface ISplashRainView {
  /** Canvas the rAF field paints into, kept sized to the window in device pixels. */
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}
