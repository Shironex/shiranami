import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import { Search, Loader2, Disc3, Check, X, Ban } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Switch } from '@/components/ui/switch';

export function MetadataEnrichSection() {
  const { t } = useTranslation('settings');
  const library = usePlayerStore(s => s.library);
  const isEnriching = useMetadataEnrichStore(s => s.isEnriching);
  const progress = useMetadataEnrichStore(s => s.progress);
  const startEnrichment = useMetadataEnrichStore(s => s.startEnrichment);
  const skippedIds = useMetadataEnrichStore(s => s.skippedIds);
  const loadSkipped = useMetadataEnrichStore(s => s.loadSkipped);
  const cancelEnrichment = useMetadataEnrichStore(s => s.cancelEnrichment);

  const [onlyMissing, setOnlyMissing] = useState(true);
  const [writeToFile, setWriteToFile] = useState(true);
  const [includeSkipped, setIncludeSkipped] = useState(false);

  // Load persisted skip list on mount
  useEffect(() => {
    loadSkipped();
  }, [loadSkipped]);

  // Count tracks with missing metadata
  const tracksNeedingEnrichment = library.filter(
    t =>
      t.artist === 'Unknown Artist' ||
      t.album === 'Unknown Album' ||
      !t.albumArt ||
      !t.genre ||
      !t.year
  );

  // How many of those are skipped (already tried, no results)
  const skippedCount = tracksNeedingEnrichment.filter(t => skippedIds.has(t.id)).length;

  const handleEnrich = useCallback(() => {
    startEnrichment({ onlyMissing, writeToFile, includeSkipped });
  }, [startEnrichment, onlyMissing, writeToFile, includeSkipped]);

  if (!IS_ELECTRON) return null;

  return (
    <SettingsCard icon={Disc3} title={
      <span className="flex items-center gap-2">
        {t('lib.enrichMetadata')}
        <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-400 text-[9px] font-semibold uppercase tracking-wider leading-none">
          {t('lib.experimental')}
        </span>
      </span>
    } subtitle={t('lib.enrichSubtitle')}>
      <div className="space-y-4">
        {/* Stats */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20">
          <Search className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-foreground">
            {tracksNeedingEnrichment.length > 0
              ? t('lib.tracksNeedEnrich', { count: tracksNeedingEnrichment.length })
              : t('lib.noTracksToEnrich')}
            {skippedCount > 0 && (
              <span className="text-muted-foreground">
                {' '}{t('lib.enrichSkippedInline', { count: skippedCount })}
              </span>
            )}
          </span>
        </div>

        {/* Options */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
            <div>
              <p className="text-sm font-medium text-foreground">{t('lib.enrichOnlyMissing')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('lib.enrichOnlyMissingDesc')}</p>
            </div>
            <Switch checked={onlyMissing} onChange={setOnlyMissing} />
          </div>

          <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
            <div>
              <p className="text-sm font-medium text-foreground">{t('lib.enrichWriteToFile')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('lib.enrichWriteToFileDesc')}</p>
            </div>
            <Switch checked={writeToFile} onChange={setWriteToFile} />
          </div>

          {skippedCount > 0 && (
            <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
              <div>
                <p className="text-sm font-medium text-foreground">{t('lib.enrichIncludeSkipped')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('lib.enrichIncludeSkippedDesc', { count: skippedCount })}
                </p>
              </div>
              <Switch checked={includeSkipped} onChange={setIncludeSkipped} />
            </div>
          )}
        </div>

        {/* Progress */}
        {isEnriching && progress && (
          <div className="px-3 py-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span className="text-sm text-foreground">
                {t('lib.enrichProgress', { current: progress.current, total: progress.total })}
              </span>
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {progress.status === 'searching' && t('lib.enrichSearching', { track: progress.trackName })}
              {progress.status === 'downloading' && t('lib.enrichDownloading')}
              {progress.status === 'writing' && t('lib.enrichWriting')}
              {progress.status === 'done' && (
                <span className="flex items-center gap-1">
                  <Check className="w-3 h-3 text-green-500" />
                  {progress.trackName}
                </span>
              )}
              {progress.status === 'error' && (
                <span className="flex items-center gap-1">
                  <X className="w-3 h-3 text-destructive" />
                  {progress.trackName}
                </span>
              )}
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-border/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleEnrich}
            disabled={isEnriching || library.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary/15 hover:bg-primary/25 text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEnriching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            {isEnriching ? t('lib.enriching') : t('lib.enrichMetadata')}
          </button>
          {isEnriching && (
            <button
              onClick={cancelEnrichment}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Ban className="w-3.5 h-3.5" />
              {t('lib.enrichCancel')}
            </button>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
