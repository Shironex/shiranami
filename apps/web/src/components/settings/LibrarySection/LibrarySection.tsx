import {
  HardDrive,
  Music,
  RefreshCw,
  Trash2,
  Loader2,
  Download,
  Upload,
  DatabaseBackup,
} from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { SubfolderPlaylistDialog } from '@/components/settings/SubfolderPlaylistDialog';
import { ScanProgressCard } from '@/components/library/ScanProgressCard';
import { DiskUsageSection } from '@/components/settings/DiskUsageSection';
import { LibraryAnalysisCard } from '@/components/settings/LibraryAnalysisCard';
import { LibraryDoctorCard } from '@/components/settings/LibraryDoctorCard';
import { useLibrarySection } from './LibrarySection.hooks';

export default function LibrarySection() {
  const {
    t,
    tc,
    isElectron,
    showAnalysis,
    showDoctor,
    trackCountLabel,
    hasTracks,
    isScanning,
    isRescanDisabled,
    isClearing,
    confirmClear,
    clearConfirmLabel,
    onRescan,
    onClearLibrary,
    onSetConfirmClear,
    isBackupBusy,
    onExport,
    onImport,
    subfolderDialogOpen,
    detectedSubfolders,
    existingPlaylistNames,
    onDialogOpenChange,
    onSubfolderConfirm,
  } = useLibrarySection();

  return (
    <>
      <SettingsCard icon={HardDrive} title={t('lib.title')} subtitle={t('lib.subtitle')}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20">
            <Music className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">{t('lib.totalTracks')}</span>
            <span className="ml-auto text-sm font-medium text-foreground tabular-nums">
              {trackCountLabel}
            </span>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={onRescan}
              disabled={isRescanDisabled}
              className="[&_svg]:size-3.5"
            >
              {isScanning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {isScanning ? t('lib.scanning') : t('lib.rescan')}
            </Button>
          </div>

          <ScanProgressCard />
        </div>
      </SettingsCard>

      {isElectron && <DiskUsageSection />}

      {showAnalysis && <LibraryAnalysisCard />}

      {showDoctor && <LibraryDoctorCard />}

      {isElectron && (
        <SettingsCard
          icon={DatabaseBackup}
          title={t('lib.backupTitle')}
          subtitle={t('lib.backupSubtitle')}
        >
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={onExport}
              disabled={isBackupBusy}
              className="[&_svg]:size-3.5"
            >
              {isBackupBusy ? <Loader2 className="animate-spin" /> : <Download />}
              {t('lib.backupExport')}
            </Button>
            <Button
              variant="secondary"
              onClick={onImport}
              disabled={isBackupBusy}
              className="[&_svg]:size-3.5"
            >
              {isBackupBusy ? <Loader2 className="animate-spin" /> : <Upload />}
              {t('lib.backupImport')}
            </Button>
          </div>
        </SettingsCard>
      )}

      {hasTracks && (
        <SettingsCard
          tone="destructive"
          icon={Trash2}
          title={t('lib.dangerZone')}
          subtitle={t('lib.dangerZoneSubtitle')}
        >
          {!confirmClear ? (
            <Button
              variant="destructiveGhost"
              onClick={() => onSetConfirmClear(true)}
              className="[&_svg]:size-3.5"
            >
              <Trash2 />
              {t('lib.clearLibrary')}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-foreground">{clearConfirmLabel}</p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onClearLibrary}
                  disabled={isClearing}
                  className="gap-2 text-sm [&_svg]:size-3.5"
                >
                  {isClearing ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {isClearing ? t('lib.clearing') : t('lib.yesClear')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSetConfirmClear(false)}
                  className="text-sm text-muted-foreground"
                >
                  {tc('cancel')}
                </Button>
              </div>
            </div>
          )}
        </SettingsCard>
      )}

      <SubfolderPlaylistDialog
        open={subfolderDialogOpen}
        onOpenChange={onDialogOpenChange}
        subfolders={detectedSubfolders}
        onConfirm={onSubfolderConfirm}
        existingPlaylistNames={existingPlaylistNames}
      />
    </>
  );
}
