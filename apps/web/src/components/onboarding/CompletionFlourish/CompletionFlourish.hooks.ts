import { Music2, Music4 } from 'lucide-react';
import type { ICompletionFlourishNote, ICompletionFlourishView } from './CompletionFlourish.types';

// Hand-tuned choreography: four notes leaving the button at slightly different
// offsets, heights and tilts so the cluster reads as drifting smoke, not a
// symmetric burst.
const NOTES: readonly ICompletionFlourishNote[] = [
  { Icon: Music2, x: -14, drift: -8, rise: -34, size: 15, delay: 0, rotate: -12 },
  { Icon: Music4, x: 4, drift: 6, rise: -46, size: 18, delay: 0.06, rotate: 10 },
  { Icon: Music2, x: 18, drift: 11, rise: -30, size: 13, delay: 0.12, rotate: 14 },
  { Icon: Music4, x: -4, drift: -3, rise: -52, size: 16, delay: 0.17, rotate: -6 },
];

/**
 * The cluster is fixed choreography — no state, no timers, no store reads — so
 * the hook only hands the shell the note table to render, keeping the shell a
 * logic-free renderer.
 */
export function useCompletionFlourish(): ICompletionFlourishView {
  return { notes: NOTES };
}
