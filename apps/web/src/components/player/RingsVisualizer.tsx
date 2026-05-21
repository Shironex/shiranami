import { useRef, useCallback } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { getAnalyser } from '@/lib/audioAnalyser';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';
import { usePrimaryRGB } from '@/hooks/usePrimaryRGB';
import { VISUALIZER_FPS, type FrequencySource } from './visualizer-source';

/**
 * Pulse Rings visualizer — concentric rings spawned on each bass kick that
 * expand and fade, with a bass-reactive glowing core dot.
 */

interface RingsVisualizerProps {
  source?: FrequencySource;
  active?: boolean;
}

interface Ring {
  r: number;
  life: number;
  intensity: number;
}

interface RingsState {
  rings: Ring[];
  lastSpawn: number;
}

export function RingsVisualizer({ source, active }: RingsVisualizerProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const stateRef = useRef<RingsState>({ rings: [], lastSpawn: 0 });
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
    const t = performance.now() / 1000;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const [pr, pg, pb] = rgbRef.current;

    let bass = 0;
    for (let i = 0; i < 6; i++) bass += raw[i];
    bass = bass / 6 / 255;

    if (bass > 0.55 && t - state.lastSpawn > 0.18) {
      state.rings.push({ r: 8, life: 1, intensity: bass });
      state.lastSpawn = t;
    }
    if (state.rings.length === 0 || t - state.lastSpawn > 1.2) {
      state.rings.push({ r: 8, life: 1, intensity: 0.4 });
      state.lastSpawn = t;
    }

    state.rings = state.rings.filter(r => r.life > 0);
    for (const ring of state.rings) {
      ring.r += 1.6;
      ring.life -= 0.012;
      const alpha = Math.max(0, ring.life) * 0.5 * ring.intensity;
      if (ring.r < maxR && alpha > 0) {
        ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;
        ctx.lineWidth = 1 + ring.intensity * 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Core dot + glow. The radial gradient varies with bass, so it cannot be
    // cached; it is the only gradient allocated per frame here.
    const dotR = 4 + bass * 18;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, dotR * 4);
    glow.addColorStop(0, `rgba(${pr + 20}, ${pg + 20}, ${pb + 10}, ${0.6 + bass * 0.3})`);
    glow.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, dotR * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${pr + 40}, ${pg + 40}, ${pb + 30}, 0.9)`;
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
    ctx.fill();
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

export default RingsVisualizer;
