import { useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { IMascotIdleNoteView } from './MascotIdleNote.types';

/** Seconds: the first note lands somewhere in 5–11s after mount. */
export const MIN_INITIAL_DELAY_S = 5;
export const INITIAL_DELAY_SPREAD_S = 6;
/** Seconds: 13–20s of quiet between notes. */
export const MIN_GAP_S = 13;
export const GAP_SPREAD_S = 7;

/**
 * Resolves the note's visibility and its randomized cadence.
 *
 * Self-gates on reduced motion (matching the mascot's own CSS-gated float), and
 * the cadence is randomized once per mount so the note never feels metronomic
 * and is staggered across the several empty states a user might have open.
 */
export function useMascotIdleNote(): IMascotIdleNoteView {
  const reducedMotion = useReducedMotion();
  const [{ initialDelay, gap }] = useState(() => ({
    initialDelay: MIN_INITIAL_DELAY_S + Math.random() * INITIAL_DELAY_SPREAD_S,
    gap: MIN_GAP_S + Math.random() * GAP_SPREAD_S,
  }));

  return {
    isVisible: !reducedMotion,
    initialDelay,
    gap,
  };
}
