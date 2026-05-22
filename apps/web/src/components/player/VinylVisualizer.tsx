import { useRef, useCallback } from 'react';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import { type FrequencySource } from './visualizer-source';

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
  const stateRef = useRef<VinylState>({ angle: 0 });
  const gradientCacheRef = useRef<GradientCache>({
    key: '',
    ctx: null,
    base: null,
    label: null,
  });

  const draw = useCallback(({ ctx, w, h, raw, binCount, rgb }: VisualizerFrame) => {
    const state = stateRef.current;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.42;
    const labelR = R * 0.28;
    const [pr, pg, pb] = rgb;

    let bass = 0;
    for (let i = 0; i < 6; i++) bass += raw[i];
    bass = bass / 6 / 255;
    let mid = 0;
    for (let i = 8; i < 32 && i < binCount; i++) mid += raw[i];
    mid = mid / 24 / 255;

    state.angle += 0.012 + bass * 0.01;

    // Rebuild cached gradients on resize / theme change.
    const cache = gradientCacheRef.current;
    const key = `${Math.round(R)}|${pr},${pg},${pb}`;
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

export default VinylVisualizer;
