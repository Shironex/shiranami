import { useParticleVisualizer } from './ParticleVisualizer.hooks';
import type { IParticleVisualizerProps } from './ParticleVisualizer.types';

/**
 * Smooth wave visualizer with gradient fill.
 *
 * Renders a flowing bezier-curved frequency line with a soft
 * gradient fill underneath. Calm and organic feel.
 */
export default function ParticleVisualizer(props: IParticleVisualizerProps) {
  const { canvasRef } = useParticleVisualizer(props);

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
