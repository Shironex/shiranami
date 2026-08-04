import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { pendingAnalysisInput, useAnalysis } from '@/hooks/useAnalysis';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { isRadioTrack } from '@/lib/utils';
import type { ILibraryAnalysisCardView } from './LibraryAnalysisCard.types';

export function useLibraryAnalysisCard(): ILibraryAnalysisCardView {
  const { t } = useTranslation('settings');
  const analysis = useAnalysis();
  const library = useLibraryStore(s => s.library);

  // Coverage over real files only: radio pseudo-tracks have nothing to decode
  // and would otherwise make a fully-analysed library read as incomplete.
  const { analyzed, total } = useMemo(() => {
    const realCount = library.filter(track => !isRadioTrack(track.filePath)).length;
    const pendingCount = pendingAnalysisInput(library).length;
    return { analyzed: realCount - pendingCount, total: realCount };
  }, [library]);

  const allAnalyzed = total > 0 && analyzed === total;

  return {
    title: t('analysis.title'),
    subtitle: t('analysis.subtitle'),
    coverageLabel: allAnalyzed
      ? t('analysis.coverageComplete')
      : t('analysis.coverage', { analyzed, total }),
    allAnalyzed,
    running: analysis.running,
    progressLabel: analysis.running
      ? t('analysis.progress', { current: analysis.current, total: analysis.total })
      : null,
    runLabel: t('analysis.run'),
    cancelLabel: t('analysis.cancel'),
    onRun: () => void analysis.start(),
    onCancel: analysis.cancel,
  };
}
