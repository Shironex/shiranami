export interface ISplashWordmarkProps {
  /** When true the blur-to-clarity entrance collapses to an opacity fade. */
  readonly reducedMotion: boolean;
}

export interface ISplashWordmarkView {
  /** Resolved entrance animation — the etch sweep, or the plain fade. */
  readonly animation: string;
}
