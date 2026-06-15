import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IAboutSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** App version string for the hero badge ('…' while loading). */
  readonly versionLabel: string;
  /** Whether the application-logs card is shown (Electron only). */
  readonly showLogsCard: boolean;
  /** Open the application log folder in the OS file explorer. */
  readonly onOpenLogs: () => void;
  /** Reset onboarding so the first-run wizard replays. */
  readonly onReplayOnboarding: () => void;
}
