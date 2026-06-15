import { useCallback, useRef } from 'react';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import type { IRingsVisualizerProps, IRingsVisualizerView } from './RingsVisualizer.types';

interface IRing {
  r: number;
  life: number;
  intensity: number;
}

interface IRingsState {
  rings: IRing[];
  lastSpawn: number;
}

export function useRingsVisualizer({
  source,
  active,
}: IRingsVisualizerProps): IRingsVisualizerView {
  const stateRef = useRef<IRingsState>({ rings: [], lastSpawn: 0 });

  const draw = useCallback(({ ctx, w, h, raw, rgb }: VisualizerFrame) => {
    const state = stateRef.current;
    const t = performance.now() / 1000;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const [pr, pg, pb] = rgb;

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
  }, []);

  const canvasRef = useVisualizerFrame({ draw, source, active });

  return { canvasRef };
}
