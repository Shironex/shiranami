import { useCallback, useRef } from 'react';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import type { IMountainVisualizerProps, IMountainVisualizerView } from './MountainVisualizer.types';

interface ILayer {
  sm: Float32Array;
  count: number;
  depth: number;
  alpha: number;
  shift: number;
}

interface IStar {
  x: number;
  y: number;
  phase: number;
}

interface IGradientCache {
  key: string;
  ctx: CanvasRenderingContext2D | null;
  layers: CanvasGradient[];
  moon: CanvasGradient | null;
}

export function useMountainVisualizer({
  source,
  active,
}: IMountainVisualizerProps): IMountainVisualizerView {
  const layersRef = useRef<ILayer[] | null>(null);
  const starsRef = useRef<IStar[] | null>(null);
  const gradientCacheRef = useRef<IGradientCache>({
    key: '',
    ctx: null,
    layers: [],
    moon: null,
  });

  const draw = useCallback(({ ctx, w, h, raw, binCount, rgb }: VisualizerFrame) => {
    if (!layersRef.current) {
      layersRef.current = [
        { sm: new Float32Array(48), count: 48, depth: 0.18, alpha: 0.28, shift: 0 },
        { sm: new Float32Array(36), count: 36, depth: 0.3, alpha: 0.42, shift: 0.08 },
        { sm: new Float32Array(28), count: 28, depth: 0.5, alpha: 0.65, shift: 0.18 },
      ];
    }
    if (!starsRef.current) {
      starsRef.current = Array.from({ length: 24 }, () => ({
        x: Math.random(),
        y: Math.random() * 0.55,
        phase: Math.random() * 6,
      }));
    }

    const layers = layersRef.current;
    const t = performance.now() / 1000;
    const baseY = h * 0.92;
    const [pr, pg, pb] = rgb;

    const moonX = w * 0.82;
    const moonY = h * 0.22;
    const moonR = Math.min(w, h) * 0.07;

    // Rebuild cached gradients on resize / theme change.
    const cache = gradientCacheRef.current;
    const key = `${Math.round(w)}x${Math.round(h)}|${pr},${pg},${pb}`;
    if (cache.key !== key || cache.ctx !== ctx) {
      cache.layers = layers.map(layer => {
        const grad = ctx.createLinearGradient(0, baseY - h * 0.4, 0, baseY);
        grad.addColorStop(0, `rgba(${pr}, ${pg - 5}, ${pb}, ${layer.alpha})`);
        grad.addColorStop(1, `rgba(${pr - 30}, ${pg - 30}, ${pb - 20}, ${layer.alpha * 0.4})`);
        return grad;
      });
      const moon = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 2.5);
      moon.addColorStop(0, `rgba(${pr + 40}, ${pg + 40}, ${pb + 20}, 0.35)`);
      moon.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, 0)`);
      cache.moon = moon;
      cache.key = key;
      cache.ctx = ctx;
    }

    // Layered ridges.
    layers.forEach((layer, li) => {
      const { sm, count, depth, shift } = layer;
      const ease = 0.07 + li * 0.03;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < count; i++) {
        const pos = (i / count) * binCount * (0.4 + li * 0.3);
        const idx = Math.floor(pos) % binCount;
        const blur =
          (raw[(idx - 1 + binCount) % binCount] + raw[idx] + raw[(idx + 1) % binCount]) / 3 / 255;
        const prev = sm[i] ?? 0;
        sm[i] = prev + (blur - prev) * ease;
        const drift = Math.sin(t * 0.4 + i * 0.5 + li) * 4;
        const x = ((i + shift) / (count - 1)) * w + drift;
        const y = baseY - sm[i] * h * depth - h * 0.05 * (li + 1);
        pts.push({ x, y });
      }

      ctx.beginPath();
      ctx.moveTo(-20, baseY);
      ctx.lineTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1];
        const c = pts[i];
        const cpx = (p.x + c.x) / 2;
        ctx.quadraticCurveTo(p.x, p.y, cpx, (p.y + c.y) / 2);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.lineTo(w + 20, baseY);
      ctx.closePath();
      ctx.fillStyle = cache.layers[li];
      ctx.fill();

      ctx.strokeStyle = `rgba(${pr + 15}, ${pg + 10}, ${pb + 20}, 0.4)`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });

    // Stars (fraction-based positions, no rescale needed on resize).
    for (const s of starsRef.current) {
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.phase));
      ctx.fillStyle = `rgba(${pr + 30}, ${pg + 30}, ${pb + 20}, ${0.5 * tw})`;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, 0.6 + tw * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Moon halo + disc.
    ctx.fillStyle = cache.moon!;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${pr + 40}, ${pg + 40}, ${pb + 30}, 0.7)`;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const canvasRef = useVisualizerFrame({ draw, source, active });

  return { canvasRef };
}
