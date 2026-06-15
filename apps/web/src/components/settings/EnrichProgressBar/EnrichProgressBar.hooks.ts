import { useTranslation } from 'react-i18next';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import type { IEnrichProgressBarView } from './EnrichProgressBar.types';

/**
 * Isolated subscriber for high-frequency progress state. Extracted so
 * MetadataEnrichSection does not re-render on every per-track event. Computes
 * the clamped completion percentage here so the shell stays declarative.
 */
export function useEnrichProgressBar(): IEnrichProgressBarView {
  const { t } = useTranslation('settings');
  const progress = useMetadataEnrichStore(s => s.progress);
  const isEnriching = useMetadataEnrichStore(s => s.isEnriching);
  const isCancelling = useMetadataEnrichStore(s => s.isCancelling);

  const visible = isEnriching && progress !== null;
  const progressPercent =
    progress && progress.total > 0
      ? Math.min(100, Math.max(0, (progress.current / progress.total) * 100))
      : 0;

  return { t, visible, progress, progressPercent, isCancelling };
}
