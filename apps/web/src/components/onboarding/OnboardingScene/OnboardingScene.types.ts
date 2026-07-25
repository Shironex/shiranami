export interface IOnboardingSceneProps {
  /** When true, the scene's only animated sub-layer (window flicker) is frozen. */
  readonly reducedMotion: boolean;
}

export interface IOnboardingSceneView {
  /** Forwarded to the night scene, which drops its flicker animation. */
  readonly reducedMotion: boolean;
}
