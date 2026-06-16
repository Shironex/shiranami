import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ISupportBannerView {
  /** Bound `settings` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether the banner has already been seen — when true the shell renders nothing. */
  readonly seen: boolean;
  /** Mark the banner seen (on dismiss or acting on a link) so it never returns. */
  readonly onSeen: () => void;
}
