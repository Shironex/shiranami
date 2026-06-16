import type {
  DownloadProgressBarProps,
  IDownloadProgressBarView,
} from './DownloadProgressBar.types';

/**
 * Resolves the {@link DownloadProgressBar} render mode. Presentational-only,
 * but the convention keeps the determinate/clamp derivation out of the shell.
 */
export function useDownloadProgressBar({
  progress,
}: DownloadProgressBarProps): IDownloadProgressBarView {
  const isDeterminate = typeof progress === 'number' && !Number.isNaN(progress);
  const clamped = isDeterminate ? Math.max(0, Math.min(100, progress)) : 0;

  return { isDeterminate, clamped };
}
