import { useCallback, useRef } from 'react';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import type {
  IConstellationVisualizerProps,
  IConstellationVisualizerView,
} from './ConstellationVisualizer.types';

interface IParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

interface IConstellationState {
  particles: IParticle[];
  canvasW: number;
  canvasH: number;
}

const PARTICLE_COUNT = 28;

export function useConstellationVisualizer({
  source,
  active,
}: IConstellationVisualizerProps): IConstellationVisualizerView {
  const stateRef = useRef<IConstellationState | null>(null);

  const draw = useCallback(({ ctx, w, h, raw, rgb }: VisualizerFrame) => {
    const t = performance.now() / 1000;
    const [pr, pg, pb] = rgb;

    // Allocate particles once; rescale to the new size on resize.
    let state = stateRef.current;
    if (!state) {
      state = {
        particles: Array.from({ length: PARTICLE_COUNT }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          size: 1 + Math.random() * 1.4,
          phase: Math.random() * 6,
        })),
        canvasW: w,
        canvasH: h,
      };
      stateRef.current = state;
    } else if (state.canvasW !== w || state.canvasH !== h) {
      const fx = w / (state.canvasW || w);
      const fy = h / (state.canvasH || h);
      for (const p of state.particles) {
        p.x *= fx;
        p.y *= fy;
      }
      state.canvasW = w;
      state.canvasH = h;
    }
    const particles = state.particles;

    let bass = 0;
    for (let i = 0; i < 6; i++) bass += raw[i];
    bass = bass / 6 / 255;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;
    }

    // Links (O(n²), n = 28).
    const linkDist = Math.min(w, h) * 0.35 + bass * 40;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < linkDist) {
          const op = (1 - d / linkDist) * 0.35 * (0.4 + bass * 0.6);
          ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${op})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Particles + soft glow.
    for (const p of particles) {
      const tw = 0.6 + 0.4 * Math.sin(t * 1.5 + p.phase);
      const r = p.size + bass * 1.5;
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      glow.addColorStop(0, `rgba(${pr + 30}, ${pg + 25}, ${pb + 20}, ${0.8 * tw})`);
      glow.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${pr + 50}, ${pg + 45}, ${pb + 40}, ${tw})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  const canvasRef = useVisualizerFrame({ draw, source, active });

  return { canvasRef };
}
