export interface ISplashLampProps {
  /** When true the breathe loop is suppressed (reduced-motion or low-perf). */
  readonly disabled?: boolean;
}

export interface ISplashLampView {
  /** Inline breathe loop, `undefined` once the loop is disabled. */
  readonly animation: string | undefined;
}
