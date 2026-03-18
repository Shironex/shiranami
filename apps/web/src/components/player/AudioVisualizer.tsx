import { useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { getAnalyser } from '@/lib/audioAnalyser';

/**
 * Canvas-based frequency-bar visualizer with a lofi aesthetic.
 *
 * Renders a compact strip of soft, rounded bars that react to
 * the current audio frequency data.  Pauses the animation loop
 * when playback is paused to conserve CPU.
 */
export function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothedRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const analyser = getAnalyser();
    if (!analyser) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const binCount = analyser.frequencyBinCount;

    // Lazy-init typed arrays
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

    // Resize the backing store if needed
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const raw = bufferRef.current;
    const smoothed = smoothedRef.current;

    // We display fewer bars than bins — group and average
    const barCount = Math.min(64, Math.floor(w / 5));
    const binsPerBar = Math.floor(binCount / barCount);
    const gap = 2;
    const barWidth = Math.max(2, (w - gap * (barCount - 1)) / barCount);
    const maxBarHeight = h * 0.55; // main bars take top 55%
    const mirrorHeight = h * 0.35; // mirror reflection below
    const midY = h * 0.58; // where bars end and mirror begins

    // Easing factor for smooth bar motion (lower = smoother / more chill)
    const ease = 0.18;

    for (let i = 0; i < barCount; i++) {
      // Average the frequency bins for this bar
      let sum = 0;
      const start = i * binsPerBar;
      for (let j = start; j < start + binsPerBar && j < binCount; j++) {
        sum += raw[j];
      }
      const avg = sum / binsPerBar;
      const normalised = avg / 255;

      // Smooth toward the target value
      const prevSmoothed = smoothed[i] ?? 0;
      const target = normalised;
      smoothed[i] = prevSmoothed + (target - prevSmoothed) * ease;

      const value = smoothed[i];
      const barH = Math.max(1.5, value * maxBarHeight);

      const x = i * (barWidth + gap);
      const y = midY - barH;

      // Gradient: deep indigo (low freq) -> primary lavender (high freq)
      const t = i / barCount;
      const r = Math.round(100 + t * 60);   // 100 -> 160
      const g = Math.round(80 + t * 40);    // 80 -> 120
      const b = Math.round(180 + t * 55);   // 180 -> 235

      // Glow
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
      ctx.shadowBlur = 6;

      // Main bar
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.55 + value * 0.35})`;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, barWidth / 2);
      ctx.fill();

      // Mirror reflection (flipped, faded)
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.12 + value * 0.1)})`;
      const mirrorH = Math.max(1, barH * 0.5);
      ctx.beginPath();
      ctx.roundRect(x, midY + 2, barWidth, Math.min(mirrorH, mirrorHeight), barWidth / 2);
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    if (isPlaying && currentTrack) {
      rafRef.current = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(rafRef.current);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, currentTrack, draw]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}
