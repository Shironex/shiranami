import { useRef, useCallback } from 'react';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import { type FrequencySource } from './visualizer-source';

/**
 * Dense vertical-bar waveform visualizer inspired by ElevenLabs UI.
 *
 * Renders tightly packed thin bars of varying height that create
 * a barcode/waveform silhouette reacting to audio frequency data.
 */

interface WaveformVisualizerProps {
  source?: FrequencySource;
  active?: boolean;
}

export function WaveformVisualizer({ source, active }: WaveformVisualizerProps = {}) {
  const smoothedRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const draw = useCallback(({ ctx, w, h, raw, binCount, rgb }: VisualizerFrame) => {
    if (!smoothedRef.current) {
      // Use more bars than bins — we'll interpolate
      smoothedRef.current = new Float32Array(200);
    }
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
    const [pr, pg, pb] = rgb;

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

export default WaveformVisualizer;
