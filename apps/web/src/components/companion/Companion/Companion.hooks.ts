import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { COMPANION_GREETING_MS, COMPANION_WAKE_MS } from '@/lib/companionMachine';
import type { ICompanionProps, ICompanionView, CompanionFace } from './Companion.types';

const VIEWBOX_WIDTH = 120;
const VIEWBOX_HEIGHT = 112;

/** Loop classes per mode — every one is a compositor-only utility. */
function rigClassFor(mode: ICompanionProps['mode'], motion: boolean): string | undefined {
  if (!motion) return undefined;
  switch (mode) {
    case 'idle':
      return 'companion-idle-float';
    case 'listening':
      return 'companion-sway';
    case 'grooving':
      return 'companion-sway-wide';
    case 'humming':
      return 'companion-sway-slow';
    case 'sleeping':
      return 'companion-sleep-breathe';
    case 'wind-down-yawn':
      return 'companion-yawn';
    case 'recap-cameo':
      return 'companion-idle-float';
    default:
      return undefined;
  }
}

function faceFor(mode: ICompanionProps['mode']): CompanionFace {
  switch (mode) {
    case 'drowsy':
    case 'sleeping':
    case 'wind-down-yawn':
      return 'closed';
    case 'listening':
    case 'grooving':
    case 'humming':
      return 'half';
    default:
      return 'open';
  }
}

function canAnimate(
  el: Element | null | undefined
): el is Element & { animate: Element['animate'] } {
  return el != null && typeof el.animate === 'function';
}

/** Stagger for the level-up foam bubbles (ms). */
const LEVELUP_BUBBLE_DELAYS = [0, 120, 260, 380, 500];

/**
 * Runs the one-shot overlays via WAAPI so they can be *cancelled* on rapid
 * skips (the crossfade lesson): a bumped `overlaySeq` re-fires the effect,
 * whose cleanup cancels the running animations before the next run starts.
 * Under reduced motion (or jsdom) nothing animates — the driver's timer still
 * clears the overlay, so state never wedges.
 */
function useCompanionOverlay(
  svgRef: ICompanionView['svgRef'],
  overlay: ICompanionProps['overlay'],
  overlaySeq: number,
  motion: boolean
): void {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || overlay == null || !motion) return;

    const animations: Animation[] = [];

    if (overlay === 'ripple') {
      const ring = svg.querySelector('.companion-ripple-ring');
      if (canAnimate(ring)) {
        animations.push(
          ring.animate(
            [
              { transform: 'scale(0.4)', opacity: 0.8 },
              { transform: 'scale(1.6)', opacity: 0 },
            ],
            { duration: 900, easing: 'ease-out' }
          )
        );
      }
    }

    if (overlay === 'levelup') {
      const pool = svg.querySelector('.companion-pool');
      if (canAnimate(pool)) {
        animations.push(
          pool.animate(
            [
              { transform: 'scale(1)' },
              { transform: 'scale(1.28, 1.35)', offset: 0.4 },
              { transform: 'scale(1)' },
            ],
            { duration: 1500, easing: 'ease-in-out' }
          )
        );
      }
      const bubbles = Array.from(svg.querySelectorAll('.companion-lvbub'));
      bubbles.forEach((bubble, index) => {
        if (!canAnimate(bubble)) return;
        animations.push(
          bubble.animate(
            [
              { transform: 'translateY(0)', opacity: 0 },
              { opacity: 0.9, offset: 0.15 },
              { transform: 'translateY(-34px)', opacity: 0 },
            ],
            {
              duration: 1700,
              delay: LEVELUP_BUBBLE_DELAYS[index % LEVELUP_BUBBLE_DELAYS.length],
              easing: 'ease-out',
            }
          )
        );
      });
      const tint = svg.querySelector('.companion-tint');
      if (canAnimate(tint)) {
        animations.push(
          tint.animate([{ opacity: 1 }, { opacity: 0.45, offset: 0.4 }, { opacity: 1 }], {
            duration: 1300,
            easing: 'ease-in-out',
          })
        );
      }
    }

    return () => {
      for (const animation of animations) animation.cancel();
    };
  }, [svgRef, overlay, overlaySeq, motion]);
}

/** The waking squash-and-stretch one-shot (0.9 → 1.06 → 1). */
function useCompanionWake(
  svgRef: ICompanionView['svgRef'],
  mode: ICompanionProps['mode'],
  motion: boolean
): void {
  useEffect(() => {
    if (mode !== 'waking' || !motion) return;
    const rig = svgRef.current?.querySelector('.companion-rig');
    if (!canAnimate(rig)) return;
    const animation = rig.animate(
      [
        { transform: 'scale(0.9, 0.84)' },
        { transform: 'scale(1.02, 1.06)', offset: 0.6 },
        { transform: 'scale(1, 1)' },
      ],
      { duration: COMPANION_WAKE_MS, easing: 'ease-out' }
    );
    return () => animation.cancel();
  }, [svgRef, mode, motion]);
}

/** The welcome-back wave — a little lift and two soft tilts, then settle. */
function useCompanionGreeting(
  svgRef: ICompanionView['svgRef'],
  mode: ICompanionProps['mode'],
  motion: boolean
): void {
  useEffect(() => {
    if (mode !== 'greeting' || !motion) return;
    const rig = svgRef.current?.querySelector('.companion-rig');
    if (!canAnimate(rig)) return;
    const animation = rig.animate(
      [
        { transform: 'translateY(0) rotate(0deg)' },
        { transform: 'translateY(-3px) rotate(-4deg)', offset: 0.22 },
        { transform: 'translateY(-3px) rotate(4deg)', offset: 0.46 },
        { transform: 'translateY(-3px) rotate(-3deg)', offset: 0.68 },
        { transform: 'translateY(0) rotate(0deg)' },
      ],
      { duration: COMPANION_GREETING_MS, easing: 'ease-in-out' }
    );
    return () => animation.cancel();
  }, [svgRef, mode, motion]);
}

/** The recap perk-up — one attentive rise, then the idle float carries on. */
function useCompanionCameo(
  svgRef: ICompanionView['svgRef'],
  mode: ICompanionProps['mode'],
  motion: boolean
): void {
  useEffect(() => {
    if (mode !== 'recap-cameo' || !motion) return;
    const rig = svgRef.current?.querySelector('.companion-rig');
    if (!canAnimate(rig)) return;
    const animation = rig.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-4px)', offset: 0.3 },
        { transform: 'translateY(0)' },
      ],
      { duration: 900, easing: 'ease-out' }
    );
    return () => animation.cancel();
  }, [svgRef, mode, motion]);
}

export function useCompanion(props: ICompanionProps): ICompanionView {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { mode, motion, overlay = null, overlaySeq = 0, size = 56, peekOffset } = props;

  useCompanionOverlay(svgRef, overlay, overlaySeq, motion);
  useCompanionWake(svgRef, mode, motion);
  useCompanionGreeting(svgRef, mode, motion);
  useCompanionCameo(svgRef, mode, motion);

  const rootStyle: CSSProperties | undefined = peekOffset
    ? ({
        '--companion-peek-x': `${peekOffset.x}px`,
        '--companion-peek-y': `${peekOffset.y}px`,
        '--companion-lean': `${peekOffset.x >= 0 ? 2 : -2}deg`,
      } as CSSProperties)
    : undefined;

  return {
    svgRef,
    face: props.faceOverride ?? faceFor(mode),
    rigClass: rigClassFor(mode, motion),
    hopClass: motion && mode === 'grooving' ? 'companion-hop' : undefined,
    height: Math.round((size * VIEWBOX_HEIGHT) / VIEWBOX_WIDTH),
    rootStyle,
  };
}
