import { useRingsVisualizer } from './RingsVisualizer.hooks';
import type { IRingsVisualizerProps } from './RingsVisualizer.types';

/**
 * Pulse Rings visualizer — concentric rings spawned on each bass kick that
 * expand and fade, with a bass-reactive glowing core dot.
 */
export default function RingsVisualizer(props: IRingsVisualizerProps) {
  const { canvasRef } = useRingsVisualizer(props);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}
