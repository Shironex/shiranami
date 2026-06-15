import { useCallback, useRef } from 'react';
import { clamp } from '@shiranami/shared';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import type { IVuVisualizerProps, IVuVisualizerView } from './VuVisualizer.types';

interface IVuState {
  smoothedL: number;
  smoothedR: number;
}

interface IGradientCache {
  key: string;
  ctx: CanvasRenderingContext2D | null;
  bezel: CanvasGradient | null;
}

function drawVuFace(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
  rgb: [number, number, number],
  bezel: CanvasGradient,
  label: string
) {
  const [pr, pg, pb] = rgb;
  ctx.save();
  ctx.translate(x, y);

  // Bezel (cached gradient).
  ctx.fillStyle = bezel;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, 0.25)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  const px = w / 2;
  const py = h * 0.92;
  const r = h * 0.78;

  // Arc.
  ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, 0.35)`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(px, py, r, Math.PI + 0.4, 2 * Math.PI - 0.4);
  ctx.stroke();

  // Ticks.
  for (let i = 0; i <= 10; i++) {
    const tt = i / 10;
    const ang = Math.PI + 0.4 + tt * (Math.PI - 0.8);
    const tickIn = r - (i % 5 === 0 ? 10 : 5);
    const x1 = px + Math.cos(ang) * tickIn;
    const y1 = py + Math.sin(ang) * tickIn;
    const x2 = px + Math.cos(ang) * r;
    const y2 = py + Math.sin(ang) * r;
    ctx.strokeStyle =
      tt > 0.75 ? 'rgba(255, 130, 110, 0.7)' : `rgba(${pr}, ${pg}, ${pb}, ${0.45 + tt * 0.3})`;
    ctx.lineWidth = i % 5 === 0 ? 1.6 : 0.8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Needle — bright solid stroke (no per-frame shadowBlur).
  const valClamped = clamp(value, 0, 1.05);
  const ang = Math.PI + 0.4 + valClamped * (Math.PI - 0.8);
  const nx = px + Math.cos(ang) * (r - 4);
  const ny = py + Math.sin(ang) * (r - 4);
  ctx.strokeStyle = `rgba(${pr + 60}, ${pg + 50}, ${pb + 50}, 0.95)`;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(nx, ny);
  ctx.stroke();

  // Pivot dot.
  ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, 0.9)`;
  ctx.beginPath();
  ctx.arc(px, py, 3, 0, Math.PI * 2);
  ctx.fill();

  // Labels.
  ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, 0.55)`;
  ctx.font = `bold ${Math.round(h * 0.13)}px 'JetBrains Mono', monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, 10, 8);
  ctx.font = `${Math.round(h * 0.075)}px 'JetBrains Mono', monospace`;
  ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, 0.4)`;
  ctx.textAlign = 'right';
  ctx.fillText('dB · VU', w - 10, 8);
  ctx.restore();
}

export function useVuVisualizer({ source, active }: IVuVisualizerProps): IVuVisualizerView {
  const stateRef = useRef<IVuState>({ smoothedL: 0, smoothedR: 0 });
  const gradientCacheRef = useRef<IGradientCache>({ key: '', ctx: null, bezel: null });

  const draw = useCallback(({ ctx, w, h, raw, binCount, rgb }: VisualizerFrame) => {
    const state = stateRef.current;

    let l = 0;
    let r = 0;
    for (let i = 0; i < 80 && i < binCount; i++) l += raw[i];
    for (let i = 60; i < 200 && i < binCount; i++) r += raw[i];
    l = l / 80 / 255;
    r = r / 140 / 255;
    state.smoothedL += (l - state.smoothedL) * 0.15;
    state.smoothedR += (r - state.smoothedR) * 0.15;

    const meterW = w * 0.46;
    const gap = w * 0.04;
    const meterH = h * 0.78;
    const y0 = (h - meterH) / 2;

    // Cache the shared bezel gradient on resize / theme change.
    const cache = gradientCacheRef.current;
    const key = `${Math.round(meterH)}|${rgb[0]},${rgb[1]},${rgb[2]}`;
    if (cache.key !== key || cache.ctx !== ctx) {
      const bezel = ctx.createLinearGradient(0, 0, 0, meterH);
      bezel.addColorStop(0, 'rgba(255,255,255,0.04)');
      bezel.addColorStop(1, 'rgba(0,0,0,0.3)');
      cache.bezel = bezel;
      cache.key = key;
      cache.ctx = ctx;
    }

    drawVuFace(
      ctx,
      w / 2 - meterW - gap / 2,
      y0,
      meterW,
      meterH,
      state.smoothedL,
      rgb,
      cache.bezel!,
      'L'
    );
    drawVuFace(ctx, w / 2 + gap / 2, y0, meterW, meterH, state.smoothedR, rgb, cache.bezel!, 'R');
  }, []);

  const canvasRef = useVisualizerFrame({ draw, source, active });

  return { canvasRef };
}
