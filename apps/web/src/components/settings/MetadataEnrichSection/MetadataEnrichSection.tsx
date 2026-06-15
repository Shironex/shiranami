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
import { useMetadataEnrichSection } from './MetadataEnrichSection.hooks';

export default function MetadataEnrichSection() {
  const {
    t,
    tc,
    isElectron,
    tracksNeedingCount,
    hasTracksNeeding,
    skippedCount,
    hasSkipped,
    isEnriching,
    isCancelling,
    showConfirm,
    enrichDisabled,
    onlyMissing,
    onOnlyMissingChange,
    includeSkipped,
    onIncludeSkippedChange,
    writeToFile,
    onWriteToFileChange,
    onEnrich,
    onConfirmedEnrich,
    onDismissConfirm,
    onCancel,
    enrichButtonRef,
    confirmYesRef,
  } = useMetadataEnrichSection();

  if (!isElectron) return null;

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
              {hasTracksNeeding
                ? t('lib.tracksNeedEnrich', { count: tracksNeedingCount })
                : t('lib.noTracksToEnrich')}
              {hasSkipped && (
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
              onCheckedChange={onOnlyMissingChange}
            />

            {hasSkipped && (
              <SettingsToggleRow
                divider
                label={t('lib.enrichIncludeSkipped')}
                description={t('lib.enrichIncludeSkippedDesc', { count: skippedCount })}
                checked={includeSkipped}
                onCheckedChange={onIncludeSkippedChange}
              />
            )}
          </div>

          {/* Progress — isolated subscriber so parent does not re-render on every event */}
          <EnrichProgressBar />

          {/* Post-run report — also an isolated subscriber (lastRunResults only) */}
          <EnrichLastRunPanel />

          {/* Action row — swaps to an inline confirmation when about to write to disk. */}
          {showConfirm ? (
            <div
              role="alertdialog"
              aria-labelledby="enrich-confirm-title"
              aria-describedby="enrich-confirm-body"
              onKeyDown={e => e.key === 'Escape' && onDismissConfirm()}
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
                    {t('lib.enrichConfirmWriteBody', { count: tracksNeedingCount })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  ref={confirmYesRef}
                  size="sm"
                  onClick={onConfirmedEnrich}
                  className="gap-2 rounded-lg bg-amber-500 text-sm text-black shadow-none hover:bg-amber-500/90 [&_svg]:size-3.5"
                >
                  <Search />
                  {t('lib.enrichYesWrite')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDismissConfirm}
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
                onClick={onEnrich}
                disabled={enrichDisabled}
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
                  onClick={onCancel}
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
          onCheckedChange={onWriteToFileChange}
        />
      </SettingsCard>
    </>
  );
}
