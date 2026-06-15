import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ISupportSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** External URL for the "buy me a coffee" call to action. */
  readonly buyMeACoffeeUrl: string;
  /** External URL for the GitHub Sponsors call to action. */
  readonly githubSponsorsUrl: string;
  /** Mark the support banner as seen (fired when either CTA is clicked). */
  readonly onMarkSeen: () => void;
}
