import { useRef, useCallback } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { getAnalyser } from '@/lib/audioAnalyser';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';
import { usePrimaryRGB } from '@/hooks/usePrimaryRGB';
import { VISUALIZER_FPS, type FrequencySource } from './visualizer-source';

/**
 * Liquid visualizer — a soft metaball blob whose vertices wobble with audio
 * and a slow morph, wrapped in a glowing halo.
 *
 * The full-canvas halo radial-gradient (the priciest op) and the blob fill
 * gradient depend only on geometry + theme. Both are cached; the halo's
 * intensity is modulated per frame via ctx.globalAlpha rather than rebuilding
 * the gradient.
 */

interface LiquidVisualizerProps {
  source?: FrequencySource;
  active?: boolean;
}

interface GradientCache {
  key: string;
  ctx: CanvasRenderingContext2D | null;
  halo: CanvasGradient | null;
  blob: CanvasGradient | null;
}

export function LiquidVisualizer({ source, active }: LiquidVisualizerProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const pointsRef = useRef<{ x: number; y: number }[] | null>(null);
  const gradientCacheRef = useRef<GradientCache>({ key: '', ctx: null, halo: null, blob: null });
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const { widthRef, heightRef, dprRef } = useCanvasSize(canvasRef);
  const { rgbRef, versionRef } = usePrimaryRGB();

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
    const cx = w / 2;
    const cy = h / 2;
    const baseR = Math.min(w, h) * 0.22;
    const N = 18;
    const [pr, pg, pb] = rgbRef.current;

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
    const key = `${Math.round(w)}x${Math.round(h)}|${versionRef.current}`;
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
  }, [widthRef, heightRef, dprRef, rgbRef, versionRef, source]);

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

export default LiquidVisualizer;
