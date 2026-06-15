import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** Visual variant for one side of the before/after sample. */
export type EnrichTagCardVariant = 'before' | 'after';

export interface IEnrichBeforeAfterPreviewView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Illustrative confidence for the enriched "after" sample badge. */
  readonly sampleConfidence: number;
}
