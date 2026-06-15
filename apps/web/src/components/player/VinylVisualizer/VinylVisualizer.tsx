import { useVinylVisualizer } from './VinylVisualizer.hooks';
import type { IVinylVisualizerProps } from './VinylVisualizer.types';

/**
 * Vinyl visualizer — a spinning record with audio-reactive grooves, a tinted
 * center label, and a mid-frequency outer glow ring.
 *
 * The disc and label radial gradients depend only on geometry + theme, so they
 * are cached and rebuilt only on resize / theme change. They are created in
 * center-relative coordinates and filled inside the rotate transform, which
 * keeps them correct without per-frame allocation.
 */
export default function VinylVisualizer(props: IVinylVisualizerProps) {
  const { canvasRef } = useVinylVisualizer(props);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}
