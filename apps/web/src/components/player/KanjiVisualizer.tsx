import { useRef, useCallback } from 'react';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import { type FrequencySource } from './visualizer-source';

/**
 * Kanji Rain visualizer — columns of falling glyphs with a fading trail, like
 * gentle rain. Each column's speed and brightness react to its frequency band.
 *
 * The column array is allocated once and only rebuilt when the column count
 * changes (resize). No gradients are allocated.
 */

interface KanjiVisualizerProps {
  source?: FrequencySource;
  active?: boolean;
}

interface Column {
  y: number;
  speed: number;
  char: string;
  rotateAt: number;
  ctr: number;
}

const GLYPHS = ['白', '波', '夜', '月', '雨', '夢', '静', '海'];
const CHAR_SIZE = 14;
const TRAIL = 8;

export function KanjiVisualizer({ source, active }: KanjiVisualizerProps = {}) {
  const colsRef = useRef<Column[] | null>(null);

  const draw = useCallback(({ ctx, w, h, raw, binCount, rgb }: VisualizerFrame) => {
    const t = performance.now() / 1000;
    const [pr, pg, pb] = rgb;
    const colCount = Math.max(8, Math.floor(w / CHAR_SIZE));

    if (!colsRef.current || colsRef.current.length !== colCount) {
      colsRef.current = Array.from({ length: colCount }, () => ({
        y: Math.random() * h,
        speed: 0.6 + Math.random() * 1.2,
        char: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        rotateAt: Math.random() * 80,
        ctr: 0,
      }));
    }
    const cols = colsRef.current;

    ctx.font = `${CHAR_SIZE}px 'Shippori Mincho', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < colCount; i++) {
      const col = cols[i];
      const binIdx = Math.floor((i / colCount) * binCount);
      const v = raw[binIdx] / 255;
      const headY = col.y;
      const x = i * CHAR_SIZE + CHAR_SIZE / 2;

      for (let k = 0; k < TRAIL; k++) {
        const yy = headY - k * CHAR_SIZE;
        if (yy < -CHAR_SIZE || yy > h + CHAR_SIZE) continue;
        const isHead = k === 0;
        const alpha = isHead ? 0.85 + v * 0.15 : Math.max(0, (0.55 - k * 0.07) * (0.6 + v * 0.4));
        ctx.fillStyle = isHead
          ? `rgba(255, 255, 255, ${alpha})`
          : `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;
        const ch = isHead ? col.char : GLYPHS[(i + k + Math.floor(t * 1.5)) % GLYPHS.length];
        ctx.fillText(ch, x, yy);
      }

      col.y += col.speed * (1.2 + v * 2.8);
      col.ctr++;
      if (col.ctr > col.rotateAt) {
        col.char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        col.ctr = 0;
        col.rotateAt = 30 + Math.random() * 80;
      }
      if (col.y > h + CHAR_SIZE * TRAIL) {
        col.y = -CHAR_SIZE * (2 + Math.random() * 6);
        col.speed = 0.6 + Math.random() * 1.4;
      }
    }
  }, []);

  const canvasRef = useVisualizerFrame({ draw, source, active });

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}

export default KanjiVisualizer;
