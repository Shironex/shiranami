import { useCallback, useRef } from 'react';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import type { IMirrorVisualizerProps, IMirrorVisualizerView } from './MirrorVisualizer.types';

export function useMirrorVisualizer({
  source,
  active,
}: IMirrorVisualizerProps): IMirrorVisualizerView {
  const smoothedRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const draw = useCallback(({ ctx, w, h, raw, binCount, rgb }: VisualizerFrame) => {
    if (!smoothedRef.current) {
      smoothedRef.current = new Float32Array(72);
    }
    const smoothed = smoothedRef.current;
    const ease = 0.16;

    const barCount = Math.min(56, Math.floor(w / 7));
    const gap = 4;
    const barW = Math.max(2.5, (w - gap * (barCount - 1)) / barCount);
    const centerY = h * 0.5;
    const maxBarH = h * 0.46;
    const binsPer = Math.max(1, Math.floor(binCount / barCount));

    const [pr, pg, pb] = rgb;

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      const start = i * binsPer;
      for (let j = start; j < start + binsPer && j < binCount; j++) sum += raw[j];
      const norm = sum / binsPer / 255;
      const prev = smoothed[i] ?? 0;
      smoothed[i] = prev + (norm - prev) * ease;
      const value = smoothed[i];

      const barH = Math.max(2, value * maxBarH);
      const x = i * (barW + gap);
      const edgeT = i / barCount;
      const fade = Math.min(1, Math.min(edgeT, 1 - edgeT) * 5);

      // Top bar — bright, anchored at the center line growing up.
      const topAlpha = (0.35 + value * 0.4) * fade;
      ctx.fillStyle = `rgba(${pr}, ${pg - 10}, ${pb}, ${topAlpha})`;
      ctx.beginPath();
      ctx.roundRect(x, centerY - barH, barW, barH, [0, 0, barW / 2, barW / 2]);
      ctx.fill();

      // Bottom bar — dimmer reflection growing down.
      const botAlpha = (0.1 + value * 0.3) * fade;
      ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb - 10}, ${botAlpha})`;
      ctx.beginPath();
      ctx.roundRect(x, centerY, barW, barH * 0.85, [barW / 2, barW / 2, 0, 0]);
      ctx.fill();
    }

    // Mirror line.
    ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, 0.18)`;
    ctx.fillRect(0, centerY - 0.5, w, 1);
  }, []);

  const canvasRef = useVisualizerFrame({ draw, source, active });

  return { canvasRef };
}
