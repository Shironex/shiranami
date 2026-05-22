import { useRef, useCallback } from 'react';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import { type FrequencySource } from './visualizer-source';

/**
 * VU Meter visualizer — twin analog needles (L/R) sweeping over a ticked arc.
 *
 * The bezel gradient depends only on meter geometry + theme and is shared by
 * both faces, so it is cached and rebuilt only on resize / theme change. The
 * needle uses a bright solid stroke — the design's per-frame shadowBlur is
 * dropped for performance.
 */

interface VuVisualizerProps {
  source?: FrequencySource;
  active?: boolean;
}

interface VuState {
  smoothedL: number;
  smoothedR: number;
}

interface GradientCache {
  key: string;
  ctx: CanvasRenderingContext2D | null;
  bezel: CanvasGradient | null;
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
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

export function VuVisualizer({ source, active }: VuVisualizerProps = {}) {
  const stateRef = useRef<VuState>({ smoothedL: 0, smoothedR: 0 });
  const gradientCacheRef = useRef<GradientCache>({ key: '', ctx: null, bezel: null });

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

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}

export default VuVisualizer;
