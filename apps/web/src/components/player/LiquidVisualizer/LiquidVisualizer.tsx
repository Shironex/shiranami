import { useLiquidVisualizer } from './LiquidVisualizer.hooks';
import type { ILiquidVisualizerProps } from './LiquidVisualizer.types';

/**
 * Liquid visualizer — a soft metaball blob whose vertices wobble with audio
 * and a slow morph, wrapped in a glowing halo.
 *
 * The full-canvas halo radial-gradient (the priciest op) and the blob fill
 * gradient depend only on geometry + theme. Both are cached; the halo's
 * intensity is modulated per frame via ctx.globalAlpha rather than rebuilding
 * the gradient.
 */
export default function LiquidVisualizer(props: ILiquidVisualizerProps) {
  const { canvasRef } = useLiquidVisualizer(props);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}
