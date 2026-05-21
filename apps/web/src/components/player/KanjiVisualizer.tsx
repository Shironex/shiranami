import { useRef, useCallback } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { getAnalyser } from '@/lib/audioAnalyser';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';
import { usePrimaryRGB } from '@/hooks/usePrimaryRGB';
import { VISUALIZER_FPS, type FrequencySource } from './visualizer-source';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const colsRef = useRef<Column[] | null>(null);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const { widthRef, heightRef, dprRef } = useCanvasSize(canvasRef);
  const { rgbRef } = usePrimaryRGB();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let binCount: number;
    let readData: (buf: Uint8Array) => boolean;

    if (source) {
      binCount = source.binCount;
      readData = source.read;
    } else {
      const analyser = getAnalyser();
      if (!analyser) return;
      binCount = analyser.frequencyBinCount;
      readData = buf => {
        analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
        return true;
      };
    }

    if (!Number.isFinite(binCount) || binCount < 1) return;

    if (!bufferRef.current || bufferRef.current.length !== binCount) {
      bufferRef.current = new Uint8Array(binCount);
    }

    if (!readData(bufferRef.current)) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = dprRef.current;
    const w = widthRef.current;
    const h = heightRef.current;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const raw = bufferRef.current;
    const t = performance.now() / 1000;
    const [pr, pg, pb] = rgbRef.current;
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
  }, [widthRef, heightRef, dprRef, rgbRef, source]);

  const shouldRun = active ?? (isPlaying && !!currentTrack);
  useRafLoop(draw, canvasRef, shouldRun, VISUALIZER_FPS);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}

export default KanjiVisualizer;
