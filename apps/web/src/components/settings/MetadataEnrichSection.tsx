import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import {
  Search,
  Loader2,
  Disc3,
  Check,
  X,
  Ban,
  Info,
  AlertTriangle,
  FileWarning,
} from 'lucide-react';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';

export function MetadataEnrichSection() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const library = useLibraryStore(s => s.library);
  const isEnriching = useMetadataEnrichStore(s => s.isEnriching);
  const progress = useMetadataEnrichStore(s => s.progress);
  const startEnrichment = useMetadataEnrichStore(s => s.startEnrichment);
  const skippedIds = useMetadataEnrichStore(s => s.skippedIds);
  const loadSkipped = useMetadataEnrichStore(s => s.loadSkipped);
  const cancelEnrichment = useMetadataEnrichStore(s => s.cancelEnrichment);
  const isCancelling = useMetadataEnrichStore(s => s.isCancelling);

  const [onlyMissing, setOnlyMissing] = useState(true);
  // Default OFF — writing to files is irreversible, so it must be an explicit opt-in (issue #37).
  const [writeToFile, setWriteToFile] = useState(false);
  const [includeSkipped, setIncludeSkipped] = useState(false);
  const [confirmWrite, setConfirmWrite] = useState(false);

  // Load persisted skip list on mount
  useEffect(() => {
    loadSkipped();
  }, [loadSkipped]);

  // Count tracks with missing metadata.
  // DB stores the English literals 'Unknown Artist' / 'Unknown Album' (written by
  // scan-utility.ts and metadata-service.ts). trackMapper's ?? fallback never fires
  // because those truthy strings are already in the row. Compare against the literals
  // so Polish (and any other locale) users see the correct count.
  const unknownArtist = 'Unknown Artist';
  const unknownAlbum = 'Unknown Album';
  const tracksNeedingEnrichment = useMemo(
    () =>
      library.filter(
        t =>
          t.artist === unknownArtist ||
          t.album === unknownAlbum ||
          !t.albumArt ||
          !t.genre ||
          !t.year
      ),
    [library, unknownArtist, unknownAlbum]
  );

  // How many of those are skipped (already tried, no results)
  const skippedCount = tracksNeedingEnrichment.filter(t => skippedIds.has(t.id)).length;

  const handleEnrich = useCallback(() => {
    // Gate destructive path behind inline confirm. Safe path (DB only) runs immediately.
    if (writeToFile) {
      setConfirmWrite(true);
      return;
    }
    startEnrichment({ onlyMissing, writeToFile, includeSkipped });
  }, [startEnrichment, onlyMissing, writeToFile, includeSkipped]);

  const handleConfirmedEnrich = useCallback(() => {
    setConfirmWrite(false);
    startEnrichment({ onlyMissing, writeToFile, includeSkipped });
  }, [startEnrichment, onlyMissing, writeToFile, includeSkipped]);

  // If the user flips write-to-file off while the confirm is up, drop the confirm.
  useEffect(() => {
    if (!writeToFile && confirmWrite) setConfirmWrite(false);
  }, [writeToFile, confirmWrite]);

  const progressPercent =
    progress && progress.total > 0
      ? Math.min(100, Math.max(0, (progress.current / progress.total) * 100))
      : 0;

  if (!IS_ELECTRON) return null;

  return (
    <>
      <SettingsCard
        icon={Disc3}
        title={
          <span className="flex items-center gap-2">
            {t('lib.enrichMetadata')}
            <StatusBadge variant="experimental">{t('lib.experimental')}</StatusBadge>
          </span>
        }
        subtitle={t('lib.enrichSubtitle')}
      >
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
                  {' '}
                  {t('lib.enrichSkippedInline', { count: skippedCount })}
                </span>
              )}
            </span>
          </div>

          {/* Manual-only reassurance: the issue #37 user feared background auto-modification. */}
          <div className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15">
            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('lib.enrichManualNotice')}
            </p>
          </div>

          {/* Options */}
          <div>
            <SettingsToggleRow
              label={t('lib.enrichOnlyMissing')}
              description={t('lib.enrichOnlyMissingDesc')}
              checked={onlyMissing}
              onCheckedChange={setOnlyMissing}
            />

            {skippedCount > 0 && (
              <SettingsToggleRow
                divider
                label={t('lib.enrichIncludeSkipped')}
                description={t('lib.enrichIncludeSkippedDesc', { count: skippedCount })}
                checked={includeSkipped}
                onCheckedChange={setIncludeSkipped}
              />
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
                {progress.status === 'searching' &&
                  t('lib.enrichSearching', { track: progress.trackName })}
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
                {progress.status === 'cancelled' && (
                  <span className="flex items-center gap-1">
                    <Ban className="w-3 h-3 text-muted-foreground" />
                    {t('lib.enrichCancelledStatus', { trackName: progress.trackName })}
                  </span>
                )}
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-border/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Action row — swaps to an inline confirmation when about to write to disk. */}
          {confirmWrite && !isEnriching ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {t('lib.enrichConfirmWriteTitle')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('lib.enrichConfirmWriteBody', {
                      count: tracksNeedingEnrichment.length,
                    })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleConfirmedEnrich}
                  className="gap-2 rounded-lg bg-amber-500 text-sm text-black shadow-none hover:bg-amber-500/90 [&_svg]:size-3.5"
                >
                  <Search />
                  {t('lib.enrichYesWrite')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmWrite(false)}
                  className="rounded-lg text-sm text-muted-foreground"
                >
                  {tc('cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                onClick={handleEnrich}
                disabled={
                  isEnriching || library.length === 0 || tracksNeedingEnrichment.length === 0
                }
                className="rounded-xl bg-primary/15 text-primary shadow-none hover:bg-primary/25 [&_svg]:size-3.5"
              >
                {isEnriching ? <Loader2 className="animate-spin" /> : <Search />}
                {isEnriching ? t('lib.enriching') : t('lib.enrichMetadata')}
              </Button>
              {isEnriching && (
                <Button
                  variant="destructiveGhost"
                  onClick={cancelEnrichment}
                  disabled={isCancelling}
                  className="rounded-xl [&_svg]:size-3.5"
                >
                  {isCancelling ? <Loader2 className="animate-spin" /> : <Ban />}
                  {isCancelling ? t('lib.enrichCancelling') : t('lib.enrichCancel')}
                </Button>
              )}
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        tone="warning"
        icon={FileWarning}
        title={t('lib.enrichFileWriteTitle')}
        subtitle={t('lib.enrichFileWriteSubtitle')}
      >
        <SettingsToggleRow
          label={t('lib.enrichWriteToFile')}
          description={t('lib.enrichWriteToFileDesc')}
          checked={writeToFile}
          onCheckedChange={setWriteToFile}
        />
      </SettingsCard>
    </>
  );
}
