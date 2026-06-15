import type { CSSProperties } from 'react';
import type { SplashMessageKey, SplashVariant } from '@/hooks/useSplashScreen';

export interface ISplashScreenProps {
  /** Library sync is still running — splash stays mounted until false. */
  readonly isLoading: boolean;
  /** Library sync errored — switches to the error variant. */
  readonly isError: boolean;
  /** Error message to display in the error variant. */
  readonly error?: string | null;
  readonly onDismissed?: () => void;
}

export interface ISplashScreenView {
  /** Whether the splash overlay is mounted in the DOM. */
  readonly isVisible: boolean;
  /** Composed wrapper class (fixed overlay + Electron rounded top). */
  readonly wrapperClassName: string;
  /** Inline fog-out transition style for the wrapper. */
  readonly wrapperStyle: CSSProperties;
  /** Whether the frameless-window drag region should render (Electron only). */
  readonly showDragRegion: boolean;
  /** Animated layers collapse to static (reduced-motion OR low-perf). */
  readonly disableBreathLoop: boolean;
  /** The user's reduced-motion preference (rain + brand read it directly). */
  readonly reducedMotion: boolean;
  /** Low-performance mode flag (rain reads it directly). */
  readonly lowPerformanceMode: boolean;
  /** Whether the rain field is frozen (error variant). */
  readonly rainPaused: boolean;
  /** Whether the status row has faded in. */
  readonly showStatus: boolean;
  /** Loading vs error variant. */
  readonly variant: SplashVariant;
  /** Current rotating message key to translate. */
  readonly messageKey: SplashMessageKey;
  /** App version string. */
  readonly version: string;
  /** Locale-formatted current time. */
  readonly clock: string;
  /** Error message to surface in the error variant. */
  readonly error: string | null | undefined;
}
