import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IDiscordPreviewProps {
  /** First content line (interpolated "details"). */
  readonly details: string;
  /** Second content line (interpolated "state"). */
  readonly state: string;
  /** Whether the elapsed-time row is shown. */
  readonly showTimestamp: boolean;
  /** Whether the large cover image is shown. */
  readonly showLargeImage: boolean;
  /** Whether the landing-page button is shown. */
  readonly showButton: boolean;
}

export interface IDiscordPreviewView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
}
