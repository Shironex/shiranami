import { useRef, useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';
import { getAnalyser } from '@/lib/audioAnalyser';
import { getPrimaryRGB } from '@/lib/utils';

/**
 * Smooth wave visualizer with gradient fill.
 *
 * Renders a flowing bezier-curved frequency line with a soft
 * gradient fill underneath. Calm and organic feel.
 */
export function ParticleVisualizer() {
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
    if (!smoothedRef.current) {
      smoothedRef.current = new Float32Array(200);
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
    const ease = 0.1;

    const pointCount = Math.min(64, Math.floor(w / 12));
    const centerY = h * 0.5;
    const maxAmp = h * 0.38;

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

    // ── Draw the mirrored wave (top half) ──
    drawWaveFill(ctx, points, centerY, w, h, false);

    // ── Draw the mirrored wave (bottom half — reflected) ──
    const mirrorPoints = points.map((p) => ({
      x: p.x,
      y: centerY + (centerY - p.y),
    }));
    drawWaveFill(ctx, mirrorPoints, centerY, w, h, true);

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
    const [pr, pg, pb] = getPrimaryRGB();
    ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, 0.5)`;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = `rgba(${pr}, ${pg}, ${pb}, 0.3)`;
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Center line ──
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, 0.06)`;
    ctx.lineWidth = 1;
    ctx.stroke();

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

/** Draw a smooth bezier wave path with gradient fill toward centerY */
function drawWaveFill(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  centerY: number,
  _w: number,
  _h: number,
  isMirror: boolean
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

  // Gradient from wave peak toward center
  const gradStart = isMirror ? centerY + 15 : centerY - 15;
  const gradEnd = centerY;
  const grad = ctx.createLinearGradient(0, gradStart, 0, gradEnd);
  const [pr, pg, pb] = getPrimaryRGB();
  grad.addColorStop(0, `rgba(${pr - 15}, ${pg - 15}, ${pb - 15}, 0.15)`);
  grad.addColorStop(1, `rgba(${pr - 15}, ${pg - 15}, ${pb - 15}, 0.0)`);
  ctx.fillStyle = grad;
  ctx.fill();
}

export default ParticleVisualizer;
