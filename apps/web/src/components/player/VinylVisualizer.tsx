import { useRef, useCallback } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { getAnalyser } from '@/lib/audioAnalyser';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';
import { usePrimaryRGB } from '@/hooks/usePrimaryRGB';
import { VISUALIZER_FPS, type FrequencySource } from './visualizer-source';

/**
 * Vinyl visualizer — a spinning record with audio-reactive grooves, a tinted
 * center label, and a mid-frequency outer glow ring.
 *
 * The disc and label radial gradients depend only on geometry + theme, so they
 * are cached and rebuilt only on resize / theme change. They are created in
 * center-relative coordinates and filled inside the rotate transform, which
 * keeps them correct without per-frame allocation.
 */

interface VinylVisualizerProps {
  source?: FrequencySource;
  active?: boolean;
}

interface VinylState {
  angle: number;
}

interface GradientCache {
  key: string;
  ctx: CanvasRenderingContext2D | null;
  base: CanvasGradient | null;
  label: CanvasGradient | null;
}

export function VinylVisualizer({ source, active }: VinylVisualizerProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const stateRef = useRef<VinylState>({ angle: 0 });
  const gradientCacheRef = useRef<GradientCache>({
    key: '',
    ctx: null,
    base: null,
    label: null,
  });
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
    const state = stateRef.current;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.42;
    const labelR = R * 0.28;
    const [pr, pg, pb] = rgbRef.current;

    let bass = 0;
    for (let i = 0; i < 6; i++) bass += raw[i];
    bass = bass / 6 / 255;
    let mid = 0;
    for (let i = 8; i < 32 && i < binCount; i++) mid += raw[i];
    mid = mid / 24 / 255;

    state.angle += 0.012 + bass * 0.01;

    // Rebuild cached gradients on resize / theme change.
    const cache = gradientCacheRef.current;
    const key = `${Math.round(R)}|${versionRef.current}`;
    if (cache.key !== key || cache.ctx !== ctx) {
      const base = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
      base.addColorStop(0, '#1a1626');
      base.addColorStop(1, '#08060e');
      cache.base = base;

      const label = ctx.createRadialGradient(0, -labelR * 0.3, 0, 0, 0, labelR);
      label.addColorStop(0, `rgba(${pr + 30}, ${pg + 25}, ${pb + 20}, 1)`);
      label.addColorStop(1, `rgba(${pr - 30}, ${pg - 30}, ${pb - 20}, 1)`);
      cache.label = label;

      cache.key = key;
      cache.ctx = ctx;
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.angle);

    // Disc.
    ctx.fillStyle = cache.base!;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    // Grooves (audio reactive).
    const grooveCount = 22;
    for (let i = 0; i < grooveCount; i++) {
      const tt = i / grooveCount;
      const gr = R * (0.28 + tt * 0.72);
      const idx = Math.floor(tt * (binCount * 0.5));
      const v = raw[idx] / 255;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 + v * 0.12})`;
      ctx.lineWidth = 0.6 + v * 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, gr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shine arc.
    ctx.strokeStyle = `rgba(${pr + 30}, ${pg + 30}, ${pb + 20}, 0.18)`;
    ctx.lineWidth = R * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.55, -Math.PI / 3, Math.PI / 8);
    ctx.stroke();

    // Label + bass glow.
    ctx.fillStyle = cache.label!;
    ctx.beginPath();
    ctx.arc(0, 0, labelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 255, ${bass * 0.25})`;
    ctx.beginPath();
    ctx.arc(0, 0, labelR, 0, Math.PI * 2);
    ctx.fill();

    // Kanji on label.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = `${Math.round(labelR * 0.7)}px 'Shippori Mincho', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('波', 0, 2);

    // Spindle.
    ctx.fillStyle = '#0a0810';
    ctx.beginPath();
    ctx.arc(0, 0, labelR * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Outer mid-driven ring glow.
    ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${0.15 + mid * 0.3})`;
    ctx.lineWidth = 1 + mid * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
    ctx.stroke();
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

export default VinylVisualizer;
