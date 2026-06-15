import { useMirrorVisualizer } from './MirrorVisualizer.hooks';
import type { IMirrorVisualizerProps } from './MirrorVisualizer.types';

/**
 * Mirror visualizer — top bars anchored to the center line with a dimmer
 * reflected copy below, like a reflection on still water.
 *
 * The design's per-bar linear gradients are replaced with solid rgba() fills
 * (the alpha already depends on audio, so the gradient added little) — this
 * removes ~112 CanvasGradient allocations per frame.
 */
export default function MirrorVisualizer(props: IMirrorVisualizerProps) {
  const { canvasRef } = useMirrorVisualizer(props);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}
