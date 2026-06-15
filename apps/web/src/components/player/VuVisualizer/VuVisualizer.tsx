import { useVuVisualizer } from './VuVisualizer.hooks';
import type { IVuVisualizerProps } from './VuVisualizer.types';

/**
 * VU Meter visualizer — twin analog needles (L/R) sweeping over a ticked arc.
 *
 * The bezel gradient depends only on meter geometry + theme and is shared by
 * both faces, so it is cached and rebuilt only on resize / theme change. The
 * needle uses a bright solid stroke — the design's per-frame shadowBlur is
 * dropped for performance.
 */
export default function VuVisualizer(props: IVuVisualizerProps) {
  const { canvasRef } = useVuVisualizer(props);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}
