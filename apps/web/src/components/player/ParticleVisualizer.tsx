import { useRef, useCallback } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';
import { usePrimaryRGB } from '@/hooks/usePrimaryRGB';
import { getAnalyser } from '@/lib/audioAnalyser';
import type { FrequencySource } from './visualizer-source';

/**
 * Smooth wave visualizer with gradient fill.
 *
 * Renders a flowing bezier-curved frequency line with a soft
 * gradient fill underneath. Calm and organic feel.
 */

interface ParticleVisualizerProps {
  source?: FrequencySource;
  active?: boolean;
}

export function ParticleVisualizer({ source, active }: ParticleVisualizerProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothedRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const { widthRef, heightRef, dprRef } = useCanvasSize(canvasRef);
  const { rgbRef, versionRef } = usePrimaryRGB();

  // Cached gradients for drawWaveFill. Invalidated when centerY, primary-rgb,
  // or the canvas context changes — see issue #50. Pre-cache avoids allocating
  // two CanvasGradient objects every frame (120/sec during playback).
  const gradientCacheRef = useRef<{
    grad: CanvasGradient | null;
    key: string;
    ctx: CanvasRenderingContext2D | null;
  }>({ grad: null, key: '', ctx: null });

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
    if (!smoothedRef.current) {
      smoothedRef.current = new Float32Array(200);
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
    const smoothed = smoothedRef.current;
    const ease = 0.1;

    const pointCount = Math.min(64, Math.floor(w / 12));
    const centerY = h * 0.5;
    const maxAmp = h * 0.38;

    // Hoist theme color once per frame (issue #49).
    const [pr, pg, pb] = rgbRef.current;

    // Rebuild gradient cache if centerY, theme color, or ctx identity changed.
    // versionRef bumps on any primary-rgb change, so we don't need to stringify
    // pr/pg/pb in the key.
    const cache = gradientCacheRef.current;
    const key = `${centerY}|${versionRef.current}`;
    if (cache.key !== key || cache.ctx !== ctx) {
      // Single gradient shared by both halves — the bottom wave is drawn with
      // a scale(1,-1) transform, which mirrors the gradient's CTM-space
      // endpoints automatically.
      const grad = ctx.createLinearGradient(0, centerY - 15, 0, centerY);
      grad.addColorStop(0, `rgba(${pr - 15}, ${pg - 15}, ${pb - 15}, 0.15)`);
      grad.addColorStop(1, `rgba(${pr - 15}, ${pg - 15}, ${pb - 15}, 0.0)`);

      cache.grad = grad;
      cache.key = key;
      cache.ctx = ctx;
    }

    // Build smoothed data points
    const points: { x: number; y: number }[] = [];

    for (let i = 0; i < pointCount; i++) {
      // Map to frequency bin with interpolation
      const binPos = (i / pointCount) * binCount;
      const binIdx = Math.floor(binPos);
      const binFrac = binPos - binIdx;
      const nextIdx = Math.min(binIdx + 1, binCount - 1);
      const rawValue = (raw[binIdx] * (1 - binFrac) + raw[nextIdx] * binFrac) / 255;

      const prev = smoothed[i] ?? 0;
      smoothed[i] = prev + (rawValue - prev) * ease;
      const value = smoothed[i];

      // Edge fade for left/right edges
      const edgeT = i / pointCount;
      const edgeFade = Math.min(1, Math.min(edgeT, 1 - edgeT) * 4);

      const x = (i / (pointCount - 1)) * w;
      const amp = value * maxAmp * edgeFade;

      points.push({ x, y: centerY - amp });
    }

    // ── Top half ──
    drawWaveFill(ctx, points, centerY, cache.grad!);

    // ── Bottom half via canvas Y-mirror ──
    // Reusing `points` with a transform avoids allocating ~64 new objects +
    // an array per frame (~3800 allocs/sec at 60fps).
    ctx.save();
    ctx.translate(0, centerY * 2);
    ctx.scale(1, -1);
    drawWaveFill(ctx, points, centerY, cache.grad!);
    ctx.restore();

    // ── Draw the wave stroke line (top) ──
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, cpx, (prev.y + curr.y) / 2);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    // Glow comes from a single CSS drop-shadow on the canvas element rather
    // than canvas shadowBlur (a Gaussian-blur stroke every frame).
    ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, 0.5)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Center line ──
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, 0.06)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [widthRef, heightRef, dprRef, rgbRef, versionRef, source]);

  const shouldRun = active ?? (isPlaying && !!currentTrack);
  useRafLoop(draw, canvasRef, shouldRun);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{
        display: 'block',
        filter: 'drop-shadow(0 0 3px rgba(var(--primary-rgb), 0.3))',
      }}
    />
  );
}

/** Draw a smooth bezier wave path with a pre-built gradient fill toward centerY. */
function drawWaveFill(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  centerY: number,
  gradient: CanvasGradient
) {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, centerY);
  ctx.lineTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, cpx, (prev.y + curr.y) / 2);
  }

  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.lineTo(last.x, centerY);
  ctx.closePath();

  ctx.fillStyle = gradient;
  ctx.fill();
}

export default ParticleVisualizer;
