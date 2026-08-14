import { useCallback, useEffect, useRef } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDecorativeMotion } from '@/hooks/useDecorativeMotion';
import { useVisualizerFrame, type VisualizerFrame } from '@/hooks/useVisualizerFrame';
import type { IVinylRecordProps, IVinylRecordView } from './VinylRecord.types';

/** Spin-up to full speed — a motor reaching 33⅓ RPM. */
const SPIN_UP_MS = 700;
/** Coast-down to rest — the platter keeps its momentum a little longer. */
const COAST_DOWN_MS = 1200;

/** Bar count for the 'spectrum' ring. */
const SPECTRUM_BARS = 56;
/**
 * The ring canvas overhangs the disc (`-inset-[15%]` → 130% of the wrapper),
 * so the disc's radius inside the canvas is the half-extent divided by 1.3.
 */
const DISC_RADIUS_FRACTION = 1 / 1.3;

interface IRingState {
  /** Heavily-smoothed bass amplitude driving the glow halo. */
  glow: number;
  /** Per-bar peak-hold levels for the spectrum ring. */
  bars: Float32Array;
}

interface IRingGradientCache {
  key: string;
  ctx: CanvasRenderingContext2D | null;
  glow: CanvasGradient | null;
}

function findSpinAnimation(el: HTMLElement): Animation | null {
  if (typeof el.getAnimations !== 'function') return null;
  return (
    el
      .getAnimations()
      .find(a => 'animationName' in a && (a as CSSAnimation).animationName === 'vinyl-spin') ?? null
  );
}

function applyPlaybackRate(animation: Animation, rate: number): void {
  if (typeof animation.updatePlaybackRate === 'function') {
    animation.updatePlaybackRate(rate);
  } else {
    animation.playbackRate = rate;
  }
}

export function useVinylRecord({
  albumArt,
  albumAlt,
  source,
  className,
}: IVinylRecordProps): IVinylRecordView {
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const labelSource = useUIStore(s => s.vinylLabelSource);
  const ringStyle = useUIStore(s => s.vinylRingStyle);
  const decorativeMotion = useDecorativeMotion();

  const discRef = useRef<HTMLDivElement>(null);
  const spinInitializedRef = useRef(false);
  const ringStateRef = useRef<IRingState>({ glow: 0, bars: new Float32Array(SPECTRUM_BARS) });
  const gradientCacheRef = useRef<IRingGradientCache>({ key: '', ctx: null, glow: null });

  // Inertia: the CSS animation always runs (kill-lists aside); play/pause only
  // eases its playback rate between 0 and 1, so the groove angle never resets.
  useEffect(() => {
    const el = discRef.current;
    if (!el || !decorativeMotion) return;
    const animation = findSpinAnimation(el);
    if (!animation) return;

    const target = isPlaying ? 1 : 0;
    // First run lands on the target directly, so a paused track mounts at rest
    // instead of coasting down from the stylesheet's default rate.
    if (!spinInitializedRef.current) {
      spinInitializedRef.current = true;
      applyPlaybackRate(animation, target);
      return;
    }

    const from = animation.playbackRate;
    if (from === target) return;
    const duration = target > from ? SPIN_UP_MS : COAST_DOWN_MS;
    const start = performance.now();
    let raf = requestAnimationFrame(function step(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      applyPlaybackRate(animation, from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, decorativeMotion]);

  const draw = useCallback(
    ({ ctx, w, h, raw, binCount, rgb }: VisualizerFrame) => {
      const state = ringStateRef.current;
      const cx = w / 2;
      const cy = h / 2;
      const discR = (Math.min(w, h) / 2) * DISC_RADIUS_FRACTION;
      const [pr, pg, pb] = rgb;

      let bass = 0;
      for (let i = 0; i < 6; i++) bass += raw[i];
      bass = bass / 6 / 255;

      if (ringStyle === 'glow') {
        // Calm halo: quick-ish attack, slow decay, and a cached ring gradient
        // (rebuilt only on resize / theme change) whose strength is amplitude.
        state.glow += (bass - state.glow) * (bass > state.glow ? 0.12 : 0.03);

        const cache = gradientCacheRef.current;
        const key = `${Math.round(discR)}|${pr},${pg},${pb}`;
        if (cache.key !== key || cache.ctx !== ctx) {
          const glow = ctx.createRadialGradient(0, 0, discR * 0.96, 0, 0, discR * 1.3);
          glow.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, 0)`);
          glow.addColorStop(0.22, `rgba(${pr}, ${pg}, ${pb}, 0.5)`);
          glow.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, 0)`);
          cache.glow = glow;
          cache.key = key;
          cache.ctx = ctx;
        }

        ctx.save();
        ctx.translate(cx, cy);
        const swell = 1 + state.glow * 0.04;
        ctx.scale(swell, swell);
        ctx.globalAlpha = 0.15 + state.glow * 0.85;
        ctx.fillStyle = cache.glow!;
        ctx.beginPath();
        ctx.arc(0, 0, discR * 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      // Spectrum: radial bars around the rim with per-bar peak hold + decay.
      let mid = 0;
      for (let i = 8; i < 32 && i < binCount; i++) mid += raw[i];
      mid = mid / 24 / 255;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineWidth = Math.max(1.5, discR * 0.016);
      ctx.lineCap = 'round';
      const r0 = discR * 1.02;
      for (let i = 0; i < SPECTRUM_BARS; i++) {
        const idx = 2 + Math.floor((i / SPECTRUM_BARS) * binCount * 0.55);
        const v = raw[Math.min(idx, binCount - 1)] / 255;
        state.bars[i] = Math.max(v, state.bars[i] * 0.86);
        const level = state.bars[i];
        const angle = (i / SPECTRUM_BARS) * Math.PI * 2 - Math.PI / 2;
        const r1 = r0 + 1 + level * discR * 0.2;
        ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${0.18 + level * 0.55 + mid * 0.1})`;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * r0, Math.sin(angle) * r0);
        ctx.lineTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
        ctx.stroke();
      }
      ctx.restore();
    },
    [ringStyle]
  );

  const ringVisible = ringStyle !== 'off' && decorativeMotion;
  const ringActive = ringVisible && (source !== undefined || (isPlaying && Boolean(currentTrack)));
  const ringCanvasRef = useVisualizerFrame({ draw, source, active: ringActive });

  return {
    discRef,
    ringCanvasRef,
    ringVisible,
    staticRingVisible: ringStyle !== 'off' && !decorativeMotion,
    labelSource,
    ringStyle,
    albumArt,
    albumAlt,
    className,
  };
}
