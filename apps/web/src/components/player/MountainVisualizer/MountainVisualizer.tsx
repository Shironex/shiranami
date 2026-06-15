import { useMountainVisualizer } from './MountainVisualizer.hooks';
import type { IMountainVisualizerProps } from './MountainVisualizer.types';

/**
 * Mountain visualizer — three layered, low-pass-smoothed silhouettes drifting
 * under a glowing moon and a sprinkle of twinkling stars.
 *
 * The layer fill gradients and moon radial depend only on geometry + theme, so
 * they are cached and rebuilt only on resize / theme change.
 */
export default function MountainVisualizer(props: IMountainVisualizerProps) {
  const { canvasRef } = useMountainVisualizer(props);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}
