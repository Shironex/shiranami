import { useCircleVisualizer } from './CircleVisualizer.hooks';
import type { ICircleVisualizerProps } from './CircleVisualizer.types';

/**
 * Compact circular frequency visualizer.
 *
 * Full ring centered in the strip with radial bars growing outward
 * and a dotted inner ring, inspired by classic circular audio visualizers.
 */
export default function CircleVisualizer(props: ICircleVisualizerProps) {
  const { canvasRef } = useCircleVisualizer(props);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{
        display: 'block',
        filter: 'drop-shadow(0 0 3px rgba(var(--primary-rgb), 0.3))',
      }}
    />
  );
}
