import { useCallback, useRef } from 'react';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import type { ILiquidVisualizerProps, ILiquidVisualizerView } from './LiquidVisualizer.types';

interface IGradientCache {
  key: string;
  ctx: CanvasRenderingContext2D | null;
  halo: CanvasGradient | null;
  blob: CanvasGradient | null;
}

export function useLiquidVisualizer({
  source,
  active,
}: ILiquidVisualizerProps): ILiquidVisualizerView {
  const pointsRef = useRef<{ x: number; y: number }[] | null>(null);
  const gradientCacheRef = useRef<IGradientCache>({ key: '', ctx: null, halo: null, blob: null });

  const draw = useCallback(({ ctx, w, h, raw, binCount, rgb }: VisualizerFrame) => {
    const t = performance.now() / 1000;
    const cx = w / 2;
    const cy = h / 2;
    const baseR = Math.min(w, h) * 0.22;
    const N = 18;
    const [pr, pg, pb] = rgb;

    // Allocate the vertex array once.
    let pts = pointsRef.current;
    if (!pts || pts.length !== N) {
      pts = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
      pointsRef.current = pts;
    }

    let totalEnergy = 0;
    for (let i = 0; i < N; i++) {
      const idx = Math.floor((i / N) * 96) % binCount;
      const v = raw[idx] / 255;
      totalEnergy += v;
      const ang = (i / N) * Math.PI * 2;
      const wobble = Math.sin(t * 0.8 + i * 0.7) * 0.08 + Math.sin(t * 1.5 + i * 1.3) * 0.05;
      const r = baseR * (1 + v * 0.55 + wobble);
      pts[i].x = cx + Math.cos(ang) * r;
      pts[i].y = cy + Math.sin(ang) * r;
    }
    const avgE = totalEnergy / N;

    // Rebuild cached gradients on resize / theme change. The halo is baked at
    // full inner opacity and modulated via globalAlpha below.
    const cache = gradientCacheRef.current;
    const key = `${Math.round(w)}x${Math.round(h)}|${pr},${pg},${pb}`;
    if (cache.key !== key || cache.ctx !== ctx) {
      const halo = ctx.createRadialGradient(cx, cy, baseR * 0.6, cx, cy, baseR * 2.4);
      halo.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, 1)`);
      halo.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, 0)`);
      cache.halo = halo;

      const blob = ctx.createRadialGradient(
        cx - baseR * 0.3,
        cy - baseR * 0.3,
        0,
        cx,
        cy,
        baseR * 1.5
      );
      blob.addColorStop(0, `rgba(${pr + 30}, ${pg + 25}, ${pb + 20}, 0.75)`);
      blob.addColorStop(1, `rgba(${pr - 20}, ${pg - 25}, ${pb - 10}, 0.55)`);
      cache.blob = blob;

      cache.key = key;
      cache.ctx = ctx;
    }

    // Halo — modulate intensity with globalAlpha instead of rebuilding.
    ctx.save();
    ctx.globalAlpha = 0.35 + avgE * 0.25;
    ctx.fillStyle = cache.halo!;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Blob fill — smooth bezier through the vertices.
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const p = pts[i % N];
      const next = pts[(i + 1) % N];
      const cpx = (p.x + next.x) / 2;
      const cpy = (p.y + next.y) / 2;
      if (i === 0) ctx.moveTo(cpx, cpy);
      else ctx.quadraticCurveTo(p.x, p.y, cpx, cpy);
    }
    ctx.fillStyle = cache.blob!;
    ctx.fill();

    // Edge highlight.
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 + avgE * 0.2})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Inner highlight.
    ctx.beginPath();
    ctx.arc(cx - baseR * 0.25, cy - baseR * 0.25, baseR * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fill();
  }, []);

  const canvasRef = useVisualizerFrame({ draw, source, active });

  return { canvasRef };
}
