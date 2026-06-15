import { useCallback, useRef } from 'react';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import type { IAudioVisualizerProps, IAudioVisualizerView } from './AudioVisualizer.types';

export function useAudioVisualizer({
  source,
  active,
}: IAudioVisualizerProps): IAudioVisualizerView {
  const smoothedRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const draw = useCallback(({ ctx, w, h, raw, binCount, rgb }: VisualizerFrame) => {
    if (!smoothedRef.current || smoothedRef.current.length !== binCount) {
      smoothedRef.current = new Float32Array(binCount);
    }
    const smoothed = smoothedRef.current;
    const [pr, pg, pb] = rgb;

    // Fewer bars = calmer, more spaced out
    const barCount = Math.min(48, Math.floor(w / 8));
    const binsPerBar = Math.max(1, Math.floor(binCount / barCount));
    const gap = 3;
    const barWidth = Math.max(2.5, (w - gap * (barCount - 1)) / barCount);
    const maxBarHeight = h * 0.4;
    const centerY = h * 0.5;

    // Slower easing for lofi smoothness
    const ease = 0.12;

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      const start = i * binsPerBar;
      for (let j = start; j < start + binsPerBar && j < binCount; j++) {
        sum += raw[j];
      }
      const avg = sum / binsPerBar;
      const normalised = avg / 255;

      const prevSmoothed = smoothed[i] ?? 0;
      smoothed[i] = prevSmoothed + (normalised - prevSmoothed) * ease;

      const value = smoothed[i];
      const barH = Math.max(2, value * maxBarHeight);

      const x = i * (barWidth + gap);

      // Edge fade — bars near edges are more transparent
      const edgePos = i / barCount;
      const edgeFade = Math.min(1, Math.min(edgePos, 1 - edgePos) * 5);

      // Color: theme-derived gradient across frequency range
      const t = i / barCount;
      const r = Math.round(pr - 45 + t * 50);
      const g = Math.round(pg - 40 + t * 35);
      const b = Math.round(pb - 45 + t * 45);
      const alpha = (0.35 + value * 0.3) * edgeFade;

      // Main bar — center-aligned (grows up and down from center).
      // Glow comes from a single CSS drop-shadow on the canvas element rather
      // than per-bar canvas shadowBlur (which cost ~2,880 Gaussian-blur fills/sec
      // at 48 bars × 60fps — the dominant per-frame visualizer cost).
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, centerY - barH / 2, barWidth, barH, barWidth / 2);
      ctx.fill();
    }
  }, []);

  const canvasRef = useVisualizerFrame({ draw, source, active });

  return { canvasRef };
}
