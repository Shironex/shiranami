import type { useTranslation } from 'react-i18next';
import type { UpdateStatus } from '@/hooks/useUpdater';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IUpdatesSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether this build runs on macOS (manual-download flow instead of auto-update). */
  readonly isMac: boolean;
  /** Current updater status. */
  readonly status: UpdateStatus;
  /** The available/ready update version, or null. */
  readonly version: string | null;
  /** Download progress (0–100). */
  readonly progress: number;
  /** Localized status message shown below the action buttons. */
  readonly statusMessage: string;
  /** Whether the "check for updates" button is disabled (checking or downloading). */
  readonly isCheckDisabled: boolean;
  /** Whether an update is available to download. */
  readonly isUpdateAvailable: boolean;
  /** Whether a downloaded update is ready to install. */
  readonly isUpdateReady: boolean;
  /** Whether the changelog link is shown (available or ready). */
  readonly showChangelogLink: boolean;
  /** Whether the status text is an error (red styling). */
  readonly isError: boolean;
  /** Whether the download-progress bar is shown. */
  readonly isDownloading: boolean;
  /** Trigger a check for updates. */
  readonly onCheckForUpdates: () => void;
  /** Start downloading the available update. */
  readonly onDownloadUpdate: () => void;
  /** Install the downloaded update and restart. */
  readonly onInstallUpdate: () => void;
}
