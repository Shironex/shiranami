import { useConstellationVisualizer } from './ConstellationVisualizer.hooks';
import type { IConstellationVisualizerProps } from './ConstellationVisualizer.types';

/**
 * Constellation visualizer — drifting particles connected by lines that
 * brighten and reach further on bass. The true "linked points" effect.
 *
 * The particle array is allocated once and rescaled on canvas resize so points
 * keep their relative positions.
 */
export default function ConstellationVisualizer(props: IConstellationVisualizerProps) {
  const { canvasRef } = useConstellationVisualizer(props);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}
