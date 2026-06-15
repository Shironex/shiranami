import { useCallback, useRef } from 'react';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import type { ICircleVisualizerProps, ICircleVisualizerView } from './CircleVisualizer.types';

export function useCircleVisualizer({
  source,
  active,
}: ICircleVisualizerProps): ICircleVisualizerView {
  const smoothedRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const draw = useCallback(({ ctx, w, h, raw, binCount, rgb }: VisualizerFrame) => {
    if (!smoothedRef.current || smoothedRef.current.length !== binCount) {
      smoothedRef.current = new Float32Array(binCount);
    }
    const smoothed = smoothedRef.current;
    const ease = 0.14;

    const centerX = w / 2;
    const centerY = h / 2;
    const innerRadius = h * 0.22;
    const barBaseRadius = innerRadius + 3;
    const maxBarLength = h * 0.24;
    const barCount = 64;
    const binsPerBar = Math.max(1, Math.floor(binCount / barCount));
    const barWidth = 1.8;

    // Compute average energy for the inner ring glow
    let totalEnergy = 0;

    const [pr, pg, pb] = rgb;

    // ── Radial frequency bars (full 360°) ──
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
      totalEnergy += value;
      const barLength = Math.max(1, value * maxBarLength);

      const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const x1 = centerX + cos * barBaseRadius;
      const y1 = centerY + sin * barBaseRadius;
      const x2 = centerX + cos * (barBaseRadius + barLength);
      const y2 = centerY + sin * (barBaseRadius + barLength);

      // Color: theme-derived with slight hue shift across the circle
      const t = i / barCount;
      const r = Math.round(pr - 15 + t * 40);
      const g = Math.round(pg - 25 + t * 25);
      const b = Math.round(pb - 35 + t * 35);
      const alpha = 0.35 + value * 0.5;

      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.lineWidth = barWidth;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    const avgEnergy = totalEnergy / barCount;

    // ── Inner dot ring ──
    const dotCount = 32;
    const dotRadius = innerRadius - 2;
    const dotSize = 1 + avgEnergy * 0.8;
    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2 - Math.PI / 2;
      const dx = centerX + Math.cos(angle) * dotRadius;
      const dy = centerY + Math.sin(angle) * dotRadius;

      ctx.beginPath();
      ctx.arc(dx, dy, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${0.25 + avgEnergy * 0.35})`;
      ctx.fill();
    }

    // ── Base ring line ──
    // Glow comes from a single CSS drop-shadow on the canvas element rather
    // than canvas shadowBlur (a Gaussian-blur stroke every frame).
    ctx.beginPath();
    ctx.arc(centerX, centerY, barBaseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${0.12 + avgEnergy * 0.2})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }, []);

  const canvasRef = useVisualizerFrame({ draw, source, active });

  return { canvasRef };
}
