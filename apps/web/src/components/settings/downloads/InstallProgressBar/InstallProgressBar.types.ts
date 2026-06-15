import type { ReactNode } from 'react';

export interface IInstallProgressBarProps {
  /** Completion percentage (0–100) shown by the progress bar. */
  readonly percent: number;
  /** Caption rendered beneath the bar (e.g. "Downloading yt-dlp 42%"). */
  readonly caption: ReactNode;
  /** Optional extra classes for the wrapper. */
  readonly className?: string;
}

export interface IInstallProgressBarView {
  /** Completion percentage (0–100) shown by the progress bar. */
  readonly percent: number;
  /** Caption rendered beneath the bar. */
  readonly caption: ReactNode;
  /** Optional extra classes for the wrapper. */
  readonly className?: string;
}
