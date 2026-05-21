import { useRef, useCallback } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { getAnalyser } from '@/lib/audioAnalyser';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';
import { usePrimaryRGB } from '@/hooks/usePrimaryRGB';
import { VISUALIZER_FPS, type FrequencySource } from './visualizer-source';

/**
 * Mirror visualizer — top bars anchored to the center line with a dimmer
 * reflected copy below, like a reflection on still water.
 *
 * The design's per-bar linear gradients are replaced with solid rgba() fills
 * (the alpha already depends on audio, so the gradient added little) — this
 * removes ~112 CanvasGradient allocations per frame.
 */

interface MirrorVisualizerProps {
  source?: FrequencySource;
  active?: boolean;
}

export function MirrorVisualizer({ source, active }: MirrorVisualizerProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothedRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const { widthRef, heightRef, dprRef } = useCanvasSize(canvasRef);
  const { rgbRef } = usePrimaryRGB();

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
      smoothedRef.current = new Float32Array(72);
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
    const ease = 0.16;

    const barCount = Math.min(56, Math.floor(w / 7));
    const gap = 4;
    const barW = Math.max(2.5, (w - gap * (barCount - 1)) / barCount);
    const centerY = h * 0.5;
    const maxBarH = h * 0.46;
    const binsPer = Math.max(1, Math.floor(binCount / barCount));

    const [pr, pg, pb] = rgbRef.current;

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      const start = i * binsPer;
      for (let j = start; j < start + binsPer && j < binCount; j++) sum += raw[j];
      const norm = sum / binsPer / 255;
      const prev = smoothed[i] ?? 0;
      smoothed[i] = prev + (norm - prev) * ease;
      const value = smoothed[i];

      const barH = Math.max(2, value * maxBarH);
      const x = i * (barW + gap);
      const edgeT = i / barCount;
      const fade = Math.min(1, Math.min(edgeT, 1 - edgeT) * 5);

      // Top bar — bright, anchored at the center line growing up.
      const topAlpha = (0.35 + value * 0.4) * fade;
      ctx.fillStyle = `rgba(${pr}, ${pg - 10}, ${pb}, ${topAlpha})`;
      ctx.beginPath();
      ctx.roundRect(x, centerY - barH, barW, barH, [0, 0, barW / 2, barW / 2]);
      ctx.fill();

      // Bottom bar — dimmer reflection growing down.
      const botAlpha = (0.1 + value * 0.3) * fade;
      ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb - 10}, ${botAlpha})`;
      ctx.beginPath();
      ctx.roundRect(x, centerY, barW, barH * 0.85, [barW / 2, barW / 2, 0, 0]);
      ctx.fill();
    }

    // Mirror line.
    ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, 0.18)`;
    ctx.fillRect(0, centerY - 0.5, w, 1);
  }, [widthRef, heightRef, dprRef, rgbRef, source]);

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

export default MirrorVisualizer;
