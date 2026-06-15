import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IPrivacySectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether crash reporting is enabled. */
  readonly enabled: boolean;
  /** Whether performance monitoring is enabled. */
  readonly performanceEnabled: boolean;
  /** Whether a restart is needed for the current config to take effect. */
  readonly needsRestart: boolean;
  /** Localized "what's sent" bullet items. */
  readonly sentItems: readonly string[];
  /** Localized "what's never sent" bullet items. */
  readonly notSentItems: readonly string[];
  /** Whether the dev-only "send test event" card is shown. */
  readonly showTestCard: boolean;
  /** Whether a test event was just sent (shows the success affordance). */
  readonly sentRecently: boolean;
  /** Toggle crash reporting on/off. */
  readonly onToggleEnabled: (value: boolean) => void;
  /** Toggle performance monitoring on/off. */
  readonly onTogglePerformance: (value: boolean) => void;
  /** Send a sample error to verify the Sentry setup. */
  readonly onSendTestEvent: () => void;
}
