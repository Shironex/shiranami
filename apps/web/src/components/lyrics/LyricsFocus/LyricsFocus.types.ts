import type { LyricLine } from '@/hooks/queries/useLyrics';

export interface ILyricsFocusProps {
  /** The synced lines (the caller guarantees non-empty). */
  readonly synced: LyricLine[];
  /** Index of the active line, or -1 before the first timestamp. */
  readonly activeLine: number;
  /** Seek to a line's timestamp (kept — focus mode stays seekable). */
  readonly onLineClick: (time: number) => void;
  /** Idle-line opacity (the user's synced dim preference). */
  readonly syncedDimOpacity: number;
  /** How many neighbours to show either side of the active line. */
  readonly windowSize?: 1 | 2;
  /** Optional container class (sizing/padding per surface). */
  readonly containerClassName?: string;
}

/** One render-ready line in the focus window. */
export interface IFocusLine {
  /** Index into `synced` (the stable key). */
  readonly index: number;
  readonly text: string;
  readonly time: number;
  readonly isActive: boolean;
  readonly isPast: boolean;
  /** Distance from the focus center (0 = in focus, then 1, 2). */
  readonly distance: number;
}

export interface ILyricsFocusView {
  /** The visible window of lines around the active one. */
  readonly lines: readonly IFocusLine[];
  /** Playback sits inside a ≥6s instrumental stretch — breathe the dots. */
  readonly showBreathingDots: boolean;
  /** Low-perf swaps the depth-of-field blur for plain opacity. */
  readonly blurEnabled: boolean;
}
