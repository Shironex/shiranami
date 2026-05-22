import { useMemo } from 'react';

/**
 * Reads the user's `prefers-reduced-motion` preference once at mount.
 *
 * Cached for the component's lifetime (matching the splash + onboarding call
 * sites, which only run for a few seconds and don't need to react to a
 * mid-session preference change). Returns `false` outside the browser.
 */
export function useReducedMotion(): boolean {
  return useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
}
