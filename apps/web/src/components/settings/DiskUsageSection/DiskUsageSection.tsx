import { HardDrive, RefreshCw, Loader2, AlertTriangle, FolderX } from 'lucide-react';
import type { VolumeUsage } from '@shiranami/contracts';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { DiskUsageBar } from '@/components/settings/DiskUsageBar';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDiskUsageSection } from './DiskUsageSection.hooks';

/**
 * Shows, per physical volume, how much disk the watched library folders occupy
 * and how much free space remains. Rendered inside the Library settings section
 * (Electron only — gated at the call site). The size figure comes from a
 * main-process FS walk; see docs/research/2026-06-06-disk-space-usage.md.
 */
export default function DiskUsageSection() {
  const { t, hasFolders, isLoading, isError, isFetching, volumes, onRefresh } =
    useDiskUsageSection();

  const headerRight = hasFolders ? (
    <IconButton
      onClick={onRefresh}
      disabled={isFetching}
      title={t('diskUsage.refresh')}
      aria-label={t('diskUsage.refresh')}
    >
      <RefreshCw className={cn(isFetching && 'animate-spin')} aria-hidden="true" />
    </IconButton>
  ) : undefined;

  const volumeCards = volumes.map((volume: VolumeUsage) => (
    <div key={volume.volumeKey} className="space-y-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-foreground">{volume.mountLabel}</span>
        {volume.folderPaths.length > 1 && (
          <span className="text-xs text-muted-foreground">
            {t('diskUsage.folderCount', { count: volume.folderPaths.length })}
          </span>
        )}
      </div>
      {volume.unavailable ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20 text-sm text-muted-foreground">
          <FolderX className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t('diskUsage.volumeUnavailable')}</span>
        </div>
      ) : (
        <DiskUsageBar volume={volume} />
      )}
    </div>
  ));

  return (
    <SettingsCard
      icon={HardDrive}
      title={t('diskUsage.title')}
      subtitle={t('diskUsage.subtitle')}
      headerRight={headerRight}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
          <span className="text-sm">{t('diskUsage.loading')}</span>
        </div>
      ) : !hasFolders ? (
        <p className="text-sm text-muted-foreground/60 py-3 text-center">
          {t('diskUsage.noFolders')}
        </p>
      ) : isError ? (
        <div className="space-y-3 py-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
            <span>{t('diskUsage.error')}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={onRefresh} className="[&_svg]:size-3.5">
            <RefreshCw />
            {t('diskUsage.retry')}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">{volumeCards}</div>
      )}
    </SettingsCard>
  );
}
