import { useAudioVisualizer } from './AudioVisualizer.hooks';
import type { IAudioVisualizerProps } from './AudioVisualizer.types';

/**
 * Canvas-based frequency visualizer with a soft lofi aesthetic.
 *
 * Renders gentle, rounded bars with edge fading and a subtle
 * mirror reflection. Bars are center-aligned for a calmer feel.
 */
export default function AudioVisualizer(props: IAudioVisualizerProps) {
  const { canvasRef } = useAudioVisualizer(props);

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
