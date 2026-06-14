import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import type { IScanProgressCardView } from './ScanProgressCard.types';

export function useScanProgressCard(): IScanProgressCardView {
  const { t } = useTranslation('settings');
  const scanState = useLibraryStore(s => s.scanState);
  const scanProgress = useLibraryStore(s => s.scanProgress);

  const progressPercent =
    scanProgress && scanProgress.fileCount > 0
      ? Math.min(100, Math.max(0, (scanProgress.fileIndex / scanProgress.fileCount) * 100))
      : 0;

  const isCancelling = scanState === 'cancelling';

  const statusLabel = scanProgress
    ? t('lib.scanProgress', {
        current: scanProgress.fileIndex,
        total: scanProgress.fileCount,
      })
    : t('lib.scanning');

  return {
    t,
    visible: scanState !== 'idle',
    progressPercent,
    statusLabel,
    currentFile: scanProgress?.currentFile,
    isCancelling,
    cancelLabel: isCancelling ? t('lib.scanCancelling') : t('lib.scanCancel'),
    onCancel: () => useLibraryStore.getState().cancelScan(),
  };
}
