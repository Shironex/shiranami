import { Loader2, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useScanProgressCard } from './ScanProgressCard.hooks';

export default function ScanProgressCard() {
  const {
    t,
    visible,
    progressPercent,
    statusLabel,
    currentFile,
    isCancelling,
    cancelLabel,
    onCancel,
  } = useScanProgressCard();

  if (!visible) return null;

  return (
    <div className="px-3 py-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
      <div className="flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        <span className="text-sm text-foreground">{statusLabel}</span>
      </div>
      {currentFile && (
        <div className="text-xs text-muted-foreground truncate">
          {t('lib.scanCurrentFile', { file: currentFile })}
        </div>
      )}
      <ProgressBar value={progressPercent} className="h-1.5 bg-border/30" />
      <Button
        variant="destructiveGhost"
        size="sm"
        onClick={onCancel}
        disabled={isCancelling}
        className="[&_svg]:size-3.5"
      >
        {isCancelling ? <Loader2 className="animate-spin" /> : <Ban />}
        {cancelLabel}
      </Button>
    </div>
  );
}
