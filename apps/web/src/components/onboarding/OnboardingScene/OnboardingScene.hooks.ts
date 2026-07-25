import type { IOnboardingSceneProps, IOnboardingSceneView } from './OnboardingScene.types';

/**
 * The scene is a static composition of three splash layers — it owns no state,
 * effects, or store reads. The hook normalizes the single motion input into the
 * view contract so the shell stays a thin, declarative renderer.
 */
export function useOnboardingScene({ reducedMotion }: IOnboardingSceneProps): IOnboardingSceneView {
  return { reducedMotion };
}
