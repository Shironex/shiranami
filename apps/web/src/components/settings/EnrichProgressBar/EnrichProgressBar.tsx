import { Loader2, Check, X, Ban } from 'lucide-react';
import { EnrichConfidenceBadge } from '@/components/settings/EnrichConfidenceBadge';
import { useEnrichProgressBar } from './EnrichProgressBar.hooks';

/**
 * Isolated subscriber for high-frequency progress state.
 * Extracted so MetadataEnrichSection does not re-render on every per-track event.
 * Only renders when a run is active (the hook gates visibility).
 */
export default function EnrichProgressBar() {
  const { t, visible, progress, progressPercent, isCancelling } = useEnrichProgressBar();

  if (!visible || !progress) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="px-3 py-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2"
    >
      <div className="flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" aria-hidden="true" />
        <span className="text-sm text-foreground">
          {t('lib.enrichProgress', { current: progress.current, total: progress.total })}
        </span>
      </div>
      <div className="text-xs text-muted-foreground min-w-0">
        {progress.status === 'searching' && t('lib.enrichSearching', { track: progress.trackName })}
        {progress.status === 'downloading' && t('lib.enrichDownloading')}
        {progress.status === 'writing' && t('lib.enrichWriting')}
        {progress.status === 'done' && (
          <span className="flex items-center gap-1.5 min-w-0">
            <Check className="w-3 h-3 text-success shrink-0" aria-hidden="true" />
            <span className="truncate">{progress.trackName}</span>
            <EnrichConfidenceBadge confidence={progress.confidence} />
          </span>
        )}
        {progress.status === 'error' && (
          <span className="flex items-center gap-1 min-w-0">
            <X className="w-3 h-3 text-destructive shrink-0" aria-hidden="true" />
            <span className="truncate">{progress.trackName}</span>
          </span>
        )}
        {progress.status === 'cancelled' && (
          <span className="flex items-center gap-1 min-w-0">
            <Ban className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="truncate">
              {t('lib.enrichCancelledStatus', { trackName: progress.trackName })}
            </span>
          </span>
        )}
      </div>
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-border/30 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
          aria-hidden="true"
        />
      </div>
      {isCancelling && <p className="text-xs text-muted-foreground">{t('lib.enrichCancelling')}</p>}
    </div>
  );
}
