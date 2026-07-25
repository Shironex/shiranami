import type { ISplashWordmarkProps, ISplashWordmarkView } from './SplashWordmark.types';

/** blur 4px -> 0 + opacity, so the reflection reads as condensation wiping clear. */
const ETCH_ENTRANCE = 'shiranami-wordmark-etch 600ms ease-out 220ms both';

/** Opacity only — the blur step is what reduced-motion users opt out of. */
const FADE_ENTRANCE = 'shiranami-wordmark-fade 300ms ease-out 220ms both';

/**
 * The reflection is static once it has landed, so the hook's whole job is
 * picking the entrance: reduced motion drops the blur step and shortens the
 * fade, keeping the same 220ms delay so the reflection still lands with the
 * rest of the scene.
 */
export function useSplashWordmark({ reducedMotion }: ISplashWordmarkProps): ISplashWordmarkView {
  return { animation: reducedMotion ? FADE_ENTRANCE : ETCH_ENTRANCE };
}
