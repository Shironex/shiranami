import { useRef, useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { getAnalyser } from '@/lib/audioAnalyser';
import { getPrimaryRGB } from '@/lib/utils';
import { useRafLoop } from '@/hooks/useRafLoop';

/**
 * Canvas-based frequency visualizer with a soft lofi aesthetic.
 *
 * Renders gentle, rounded bars with edge fading and a subtle
 * mirror reflection. Bars are center-aligned for a calmer feel.
 */
export function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothedRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

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

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const raw = bufferRef.current;
    const smoothed = smoothedRef.current;

    // Fewer bars = calmer, more spaced out
    const barCount = Math.min(48, Math.floor(w / 8));
    const binsPerBar = Math.floor(binCount / barCount);
    const gap = 3;
    const barWidth = Math.max(2.5, (w - gap * (barCount - 1)) / barCount);
    const maxBarHeight = h * 0.4;
    const centerY = h * 0.5;

    // Slower easing for lofi smoothness
    const ease = 0.12;

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
      const barH = Math.max(2, value * maxBarHeight);

      const x = i * (barWidth + gap);

      // Edge fade — bars near edges are more transparent
      const edgePos = i / barCount;
      const edgeFade = Math.min(1, Math.min(edgePos, 1 - edgePos) * 5);

      // Color: theme-derived gradient across frequency range
      const [pr, pg, pb] = getPrimaryRGB();
      const t = i / barCount;
      const r = Math.round(pr - 45 + t * 50);
      const g = Math.round(pg - 40 + t * 35);
      const b = Math.round(pb - 45 + t * 45);
      const alpha = (0.35 + value * 0.3) * edgeFade;

      // Subtle glow
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.3 * edgeFade})`;
      ctx.shadowBlur = 4;

      // Main bar — center-aligned (grows up and down from center)
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, centerY - barH / 2, barWidth, barH, barWidth / 2);
      ctx.fill();

      // Reset shadow for reflection
      ctx.shadowBlur = 0;
    }

  }, []);

  useRafLoop(draw, canvasRef, isPlaying && !!currentTrack);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}

export default AudioVisualizer;
