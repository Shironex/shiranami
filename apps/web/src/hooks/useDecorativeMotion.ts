import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useUIStore } from '@/stores/useUIStore';

/**
 * The single gate for decorative (non-functional) motion — celebratory pops,
 * tilts, glows, and similar flourishes.
 *
 * Returns `true` only when neither the OS `prefers-reduced-motion` preference
 * nor the app's low-performance escape hatch is set. Functional press/tap
 * feedback is intentionally NOT gated by this.
 */
export function useDecorativeMotion(): boolean {
  const reducedMotion = useReducedMotion();
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  return !reducedMotion && !lowPerformanceMode;
}
