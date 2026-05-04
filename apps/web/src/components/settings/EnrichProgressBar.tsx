import { useTranslation } from 'react-i18next';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import { Loader2, Check, X, Ban } from 'lucide-react';

/**
 * Isolated subscriber for high-frequency progress state.
 * Extracted so MetadataEnrichSection does not re-render on every per-track event.
 * Only mounts when isEnriching is true (parent gates rendering).
 */
export function EnrichProgressBar() {
  const { t } = useTranslation('settings');
  const progress = useMetadataEnrichStore(s => s.progress);
  const isEnriching = useMetadataEnrichStore(s => s.isEnriching);
  const isCancelling = useMetadataEnrichStore(s => s.isCancelling);

  if (!isEnriching || !progress) return null;

  const progressPercent =
    progress.total > 0 ? Math.min(100, Math.max(0, (progress.current / progress.total) * 100)) : 0;

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
          <span className="flex items-center gap-1 min-w-0">
            <Check className="w-3 h-3 text-green-500 shrink-0" aria-hidden="true" />
            <span className="truncate">{progress.trackName}</span>
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
