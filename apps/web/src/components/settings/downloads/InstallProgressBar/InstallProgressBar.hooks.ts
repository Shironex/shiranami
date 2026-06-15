import type { IInstallProgressBarProps, IInstallProgressBarView } from './InstallProgressBar.types';

/**
 * InstallProgressBar is a pure presentational progress indicator; the hook
 * forwards its visual props so the shell stays a thin, logic-free render.
 */
export function useInstallProgressBar({
  percent,
  caption,
  className,
}: IInstallProgressBarProps): IInstallProgressBarView {
  return { percent, caption, className };
}
