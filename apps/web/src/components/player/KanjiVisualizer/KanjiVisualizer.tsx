import { useKanjiVisualizer } from './KanjiVisualizer.hooks';
import type { IKanjiVisualizerProps } from './KanjiVisualizer.types';

/**
 * Kanji Rain visualizer — columns of falling glyphs with a fading trail, like
 * gentle rain. Each column's speed and brightness react to its frequency band.
 *
 * The column array is allocated once and only rebuilt when the column count
 * changes (resize). No gradients are allocated.
 */
export default function KanjiVisualizer(props: IKanjiVisualizerProps) {
  const { canvasRef } = useKanjiVisualizer(props);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}
