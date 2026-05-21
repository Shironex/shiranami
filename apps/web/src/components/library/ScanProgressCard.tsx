import { useTranslation } from 'react-i18next';
import { Loader2, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { ProgressBar } from '@/components/ui/progress-bar';

export function ScanProgressCard() {
  const { t } = useTranslation('settings');
  const scanState = useLibraryStore(s => s.scanState);
  const scanProgress = useLibraryStore(s => s.scanProgress);

  if (scanState === 'idle') return null;

  const progressPercent =
    scanProgress && scanProgress.fileCount > 0
      ? Math.min(100, Math.max(0, (scanProgress.fileIndex / scanProgress.fileCount) * 100))
      : 0;

  const isCancelling = scanState === 'cancelling';

  return (
    <div className="px-3 py-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
      <div className="flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        <span className="text-sm text-foreground">
          {scanProgress
            ? t('lib.scanProgress', {
                current: scanProgress.fileIndex,
                total: scanProgress.fileCount,
              })
            : t('lib.scanning')}
        </span>
      </div>
      {scanProgress?.currentFile && (
        <div className="text-xs text-muted-foreground truncate">
          {t('lib.scanCurrentFile', { file: scanProgress.currentFile })}
        </div>
      )}
      <ProgressBar value={progressPercent} className="h-1.5 bg-border/30" />
      <Button
        variant="destructiveGhost"
        size="sm"
        onClick={() => useLibraryStore.getState().cancelScan()}
        disabled={isCancelling}
        className="rounded-lg [&_svg]:size-3.5"
      >
        {isCancelling ? <Loader2 className="animate-spin" /> : <Ban />}
        {isCancelling ? t('lib.scanCancelling') : t('lib.scanCancel')}
      </Button>
    </div>
  );
}
