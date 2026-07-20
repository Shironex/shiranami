import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { IStaggerListView } from './StaggerList.types';

/**
 * Resolves whether {@link StaggerList} should skip its container animation.
 * Reads the reduced-motion preference here so the shell body stays declarative
 * and callers never have to pass it in.
 */
export function useStaggerList(): IStaggerListView {
  return { reducedMotion: useReducedMotion() };
}
