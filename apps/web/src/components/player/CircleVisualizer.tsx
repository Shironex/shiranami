import { useRef, useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { getAnalyser } from '@/lib/audioAnalyser';
import { getPrimaryRGB } from '@/lib/utils';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';

/**
 * Compact circular frequency visualizer.
 *
 * Full ring centered in the strip with radial bars growing outward
 * and a dotted inner ring, inspired by classic circular audio visualizers.
 */
export function CircleVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothedRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const { widthRef, heightRef, dprRef } = useCanvasSize(canvasRef);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const analyser = getAnalyser();
    if (!analyser) {
      return;
    }

    const binCount = analyser.frequencyBinCount;

    if (!bufferRef.current || bufferRef.current.length !== binCount) {
      bufferRef.current = new Uint8Array(binCount);
    }
    if (!smoothedRef.current || smoothedRef.current.length !== binCount) {
      smoothedRef.current = new Float32Array(binCount);
    }

    analyser.getByteFrequencyData(bufferRef.current);

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
    const ease = 0.14;

    const centerX = w / 2;
    const centerY = h / 2;
    const innerRadius = h * 0.22;
    const barBaseRadius = innerRadius + 3;
    const maxBarLength = h * 0.24;
    const barCount = 64;
    const binsPerBar = Math.floor(binCount / barCount);
    const barWidth = 1.8;

    // Compute average energy for the inner ring glow
    let totalEnergy = 0;

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
      const [pr, pg, pb] = getPrimaryRGB();
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
      const [pr, pg, pb] = getPrimaryRGB();
      ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${0.25 + avgEnergy * 0.35})`;
      ctx.fill();
    }

    // ── Base ring line ──
    const [pr, pg, pb] = getPrimaryRGB();
    ctx.beginPath();
    ctx.arc(centerX, centerY, barBaseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${0.12 + avgEnergy * 0.2})`;
    ctx.lineWidth = 1;
    ctx.shadowColor = `rgba(${pr}, ${pg}, ${pb}, ${0.15 + avgEnergy * 0.15})`;
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

  }, [widthRef, heightRef, dprRef]);

  useRafLoop(draw, canvasRef, isPlaying && !!currentTrack);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}

export default CircleVisualizer;
