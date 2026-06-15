import { useTranslation } from 'react-i18next';
import type { IEnrichBeforeAfterPreviewView } from './EnrichBeforeAfterPreview.types';

// Illustrative confidence for the enriched sample — a "strong match" so the
// badge demonstrates the high tier the user will most often see.
const SAMPLE_CONFIDENCE = 0.92;

/**
 * Binds the `settings` translator and the illustrative sample confidence for
 * the static before/after preview; the shell stays a thin, logic-free render.
 */
export function useEnrichBeforeAfterPreview(): IEnrichBeforeAfterPreviewView {
  const { t } = useTranslation('settings');
  return { t, sampleConfidence: SAMPLE_CONFIDENCE };
}
