import { useRef, useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { getAnalyser } from '@/lib/audioAnalyser';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';
import { usePrimaryRGB } from '@/hooks/usePrimaryRGB';

/**
 * Dense vertical-bar waveform visualizer inspired by ElevenLabs UI.
 *
 * Renders tightly packed thin bars of varying height that create
 * a barcode/waveform silhouette reacting to audio frequency data.
 */
export function WaveformVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothedRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const { widthRef, heightRef, dprRef } = useCanvasSize(canvasRef);
  const { rgbRef } = usePrimaryRGB();

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
      // Use more bars than bins — we'll interpolate
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
    const ease = 0.18;

    // Dense bar count — creates that barcode/waveform look
    const barCount = Math.min(120, Math.floor(w / 4));
    const barWidth = 2;
    const gap = Math.max(1, (w - barCount * barWidth) / (barCount - 1));
    const totalWidth = barCount * barWidth + (barCount - 1) * gap;
    const offsetX = (w - totalWidth) / 2;

    const centerY = h / 2;
    const maxBarH = h * 0.4;
    const minBarH = 2;

    // Hoist theme color once per frame — was ~120 CSS-var lookups/frame (issue #49).
    const [pr, pg, pb] = rgbRef.current;

    for (let i = 0; i < barCount; i++) {
      // Map bar index to frequency bin (with interpolation)
      const binPos = (i / barCount) * binCount;
      const binIdx = Math.floor(binPos);
      const binFrac = binPos - binIdx;
      const nextIdx = Math.min(binIdx + 1, binCount - 1);
      const rawValue = (raw[binIdx] * (1 - binFrac) + raw[nextIdx] * binFrac) / 255;

      // Smooth
      const prev = smoothed[i] ?? 0;
      smoothed[i] = prev + (rawValue - prev) * ease;
      const value = smoothed[i];

      const barH = Math.max(minBarH, value * maxBarH);
      const x = offsetX + i * (barWidth + gap);

      // Edge fade
      const edgeT = i / barCount;
      const edgeFade = Math.min(1, Math.min(edgeT, 1 - edgeT) * 6);

      const alpha = (0.4 + value * 0.5) * edgeFade;

      ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;

      // Center-aligned bar (grows from center up and down)
      ctx.beginPath();
      ctx.roundRect(x, centerY - barH / 2, barWidth, barH, 1);
      ctx.fill();
    }

  }, [widthRef, heightRef, dprRef, rgbRef]);

  useRafLoop(draw, canvasRef, isPlaying && !!currentTrack);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}

export default WaveformVisualizer;
