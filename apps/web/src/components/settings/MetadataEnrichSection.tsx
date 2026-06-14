import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { UNKNOWN_ARTIST, UNKNOWN_ALBUM } from '@shiranami/shared';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import { Search, Loader2, Disc3, Ban, Info, AlertTriangle, FileWarning } from 'lucide-react';
import {
  SettingsCard,
  SettingsInfoCallout,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { EnrichBeforeAfterPreview } from '@/components/settings/EnrichBeforeAfterPreview';
import { EnrichProgressBar } from '@/components/settings/EnrichProgressBar';
import { EnrichLastRunPanel } from '@/components/settings/EnrichLastRunPanel';

export function MetadataEnrichSection() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const library = useLibraryStore(s => s.library);
  const isEnriching = useMetadataEnrichStore(s => s.isEnriching);
  const startEnrichment = useMetadataEnrichStore(s => s.startEnrichment);
  const skippedIds = useMetadataEnrichStore(s => s.skippedIds);
  const loadSkipped = useMetadataEnrichStore(s => s.loadSkipped);
  const cancelEnrichment = useMetadataEnrichStore(s => s.cancelEnrichment);
  const isCancelling = useMetadataEnrichStore(s => s.isCancelling);

  const enrichButtonRef = useRef<HTMLButtonElement>(null);
  const confirmYesRef = useRef<HTMLButtonElement>(null);

  const [onlyMissing, setOnlyMissing] = useState(true);
  // Default OFF — writing to files is irreversible, so it must be an explicit opt-in.
  const [writeToFile, setWriteToFile] = useState(false);
  const [includeSkipped, setIncludeSkipped] = useState(false);
  const [confirmWrite, setConfirmWrite] = useState(false);

  // Load persisted skip list on mount
  useEffect(() => {
    loadSkipped();
  }, [loadSkipped]);

  // Count tracks with missing metadata against the DB sentinels (the scanner
  // writes these exact strings). The imported constants are stable module-level
  // references, so the memo dep never rebuilds on locale switches.
  const tracksNeedingEnrichment = useMemo(
    () =>
      library.filter(
        t =>
          t.artist === UNKNOWN_ARTIST ||
          t.album === UNKNOWN_ALBUM ||
          !t.albumArt ||
          !t.genre ||
          !t.year
      ),
    [library]
  );

  // Memoized: skippedCount only changes when the enrichment list or skip set changes,
  // not on every progress tick.
  const skippedCount = useMemo(
    () => tracksNeedingEnrichment.filter(t => skippedIds.has(t.id)).length,
    [tracksNeedingEnrichment, skippedIds]
  );

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

  // Focus the confirm's primary action when it opens; restore focus on dismiss.
  // prevConfirmWrite guards the restore branch so it only runs on a true→false
  // transition, not on initial mount when confirmWrite is already false.
  const prevConfirmWrite = useRef(false);
  useEffect(() => {
    if (confirmWrite) {
      confirmYesRef.current?.focus();
    } else if (prevConfirmWrite.current) {
      enrichButtonRef.current?.focus();
    }
    prevConfirmWrite.current = confirmWrite;
  }, [confirmWrite]);

  if (!IS_ELECTRON) return null;

  return (
    <>
      {/* Value-preview first: a static before/after sample makes what enrichment
          does legible before the user commits, especially for the irreversible
          file-write path. tone="info" reads as a reflection, not a control. */}
      <SettingsCard tone="info" className="!p-3">
        <SettingsPreview title={t('enr.previewTitle')}>
          <EnrichBeforeAfterPreview />
        </SettingsPreview>
      </SettingsCard>

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

          {/* Manual-only reassurance: enrichment never modifies files in the background. */}
          <SettingsInfoCallout icon={Info}>{t('lib.enrichManualNotice')}</SettingsInfoCallout>

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

          {/* Progress — isolated subscriber so parent does not re-render on every event */}
          <EnrichProgressBar />

          {/* Post-run report — also an isolated subscriber (lastRunResults only) */}
          <EnrichLastRunPanel />

          {/* Action row — swaps to an inline confirmation when about to write to disk. */}
          {confirmWrite && !isEnriching ? (
            <div
              role="alertdialog"
              aria-labelledby="enrich-confirm-title"
              aria-describedby="enrich-confirm-body"
              onKeyDown={e => e.key === 'Escape' && setConfirmWrite(false)}
              className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="w-4 h-4 text-amber-500 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p id="enrich-confirm-title" className="text-sm font-medium text-foreground">
                    {t('lib.enrichConfirmWriteTitle')}
                  </p>
                  <p id="enrich-confirm-body" className="text-xs text-muted-foreground">
                    {t('lib.enrichConfirmWriteBody', {
                      count: tracksNeedingEnrichment.length,
                    })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  ref={confirmYesRef}
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
                ref={enrichButtonRef}
                onClick={handleEnrich}
                disabled={
                  isEnriching || library.length === 0 || tracksNeedingEnrichment.length === 0
                }
                aria-busy={isEnriching}
                className="rounded-xl bg-primary/15 text-primary shadow-none hover:bg-primary/25 [&_svg]:size-3.5"
              >
                {isEnriching ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Search aria-hidden="true" />
                )}
                {isEnriching ? t('lib.enriching') : t('lib.enrichMetadata')}
              </Button>
              {isEnriching && (
                <Button
                  variant="destructiveGhost"
                  onClick={cancelEnrichment}
                  disabled={isCancelling}
                  aria-busy={isCancelling}
                  className="rounded-xl [&_svg]:size-3.5"
                >
                  {isCancelling ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Ban aria-hidden="true" />
                  )}
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
