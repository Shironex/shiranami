import { useCallback, useRef, type RefObject } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { getAnalyser } from '@/lib/audioAnalyser';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';
import { usePrimaryRGB } from '@/hooks/usePrimaryRGB';
import { VISUALIZER_FPS, type FrequencySource } from '@/components/player/visualizer-source';

/** Per-frame context handed to the draw callback once the prelude succeeds. */
export interface VisualizerFrame {
  /** 2D context, already DPR-transformed and cleared for this frame. */
  ctx: CanvasRenderingContext2D;
  /** CSS width in px. */
  w: number;
  /** CSS height in px. */
  h: number;
  /** Current device pixel ratio. */
  dpr: number;
  /** Raw byte frequency data for this frame (length === `binCount`). */
  raw: Uint8Array;
  /** Number of frequency bins. */
  binCount: number;
  /** `--primary-rgb` tuple, hoisted once per frame. */
  rgb: [number, number, number];
}

interface UseVisualizerFrameOptions {
  /**
   * Per-frame draw body. Receives a ready `VisualizerFrame`; the shared
   * source-resolution, buffer (re)allocation, context acquisition, DPR-aware
   * resize, transform, clear, and rgb hoist all run before it. Memoize it
   * (`useCallback`) like the existing visualizers do.
   */
  draw: (frame: VisualizerFrame) => void;
  /**
   * Optional external frequency source (e.g. the radio preview analyser).
   * When omitted, the global audio-engine analyser from `getAnalyser()` is used.
   */
  source?: FrequencySource;
  /**
   * Force the loop on/off. When omitted, runs while a track is playing
   * (`isPlaying && currentTrack`).
   */
  active?: boolean;
}

/**
 * Encapsulates the visualizer per-frame prelude that was copy-pasted across
 * all 12 `*Visualizer` components: store subscription, canvas-size + primary
 * rgb hooks, source-vs-analyser resolution, binCount validation, byte-buffer
 * reuse, `getContext('2d')`, DPR-aware canvas resize + `setTransform` + clear,
 * and hoisting the rgb tuple — then runs the caller's draw body and registers
 * the frame-rate-capped `useRafLoop`.
 *
 * Returns the `canvasRef` to attach to the `<canvas>`. Visualizers keep their
 * own extra refs (e.g. smoothed buffers) in their component body and pass only
 * the draw callback. Migrating the existing 12 components is Phase 3.
 */
export function useVisualizerFrame({
  draw,
  source,
  active,
}: UseVisualizerFrameOptions): RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const { widthRef, heightRef, dprRef } = useCanvasSize(canvasRef);
  const { rgbRef } = usePrimaryRGB();

  const frameCallback = useCallback(() => {
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

    draw({ ctx, w, h, dpr, raw: bufferRef.current, binCount, rgb: rgbRef.current });
  }, [draw, source, widthRef, heightRef, dprRef, rgbRef]);

  const shouldRun = active ?? (isPlaying && !!currentTrack);
  useRafLoop(frameCallback, canvasRef, shouldRun, VISUALIZER_FPS);

  return canvasRef;
}
