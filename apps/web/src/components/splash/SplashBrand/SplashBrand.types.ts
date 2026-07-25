import type { SplashMessageKey, SplashVariant } from '@/hooks/useSplashScreen';

export interface ISplashBrandProps {
  /** Whether the loader/status row has faded in yet. */
  readonly showStatus: boolean;
  /** Loading vs error variant. */
  readonly variant: SplashVariant;
  /** Current rotating message key to translate. */
  readonly messageKey: SplashMessageKey;
  /** Error message to surface in the error variant. */
  readonly error?: string | null;
  /** When true the LED pulse, loader sweep, and message swap are dropped. */
  readonly reducedMotion: boolean;
}

export interface ISplashBrandView {
  /** Translated pill-badge label. */
  readonly badgeLabel: string;
  /** LED pulse loop, `undefined` under reduced motion. */
  readonly ledAnimation: string | undefined;
  /** Loader sweep loop, `undefined` under reduced motion. */
  readonly sweepAnimation: string | undefined;
  /** Message swap fade, `undefined` under reduced motion. */
  readonly messageAnimation: string | undefined;
  /** Whether the status block is visible to assistive tech and to the eye. */
  readonly showStatus: boolean;
  /** Composed class for the status block, carrying its fade state. */
  readonly statusClassName: string;
  /** Derived: whether the error message + retry replace the loader. */
  readonly isError: boolean;
  /** Failure copy, falling back to the retry string when none was supplied. */
  readonly errorMessage: string;
  /** Translated retry button label. */
  readonly retryLabel: string;
  /** Remount key so each rotating message replays its fade. */
  readonly messageKey: SplashMessageKey;
  /** Translated rotating status message. */
  readonly statusMessage: string;
  /** Reloads the window to re-run boot after a failed library sync. */
  readonly onRetry: () => void;
}
