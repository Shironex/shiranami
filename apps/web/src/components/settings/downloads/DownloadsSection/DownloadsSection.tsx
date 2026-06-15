import { ArrowDownToLine, Download, RefreshCw } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { DownloadLocationPanel } from '@/components/settings/downloads/DownloadLocationPanel';
import { DownloadsSectionSkeleton } from '@/components/settings/downloads/DownloadsSectionSkeleton';
import { InstallProgressBar } from '@/components/settings/downloads/InstallProgressBar';
import { ToolStatusRow } from '@/components/settings/downloads/ToolStatusRow';
import { ToolVersionBlock } from '@/components/settings/downloads/ToolVersionBlock';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';
import { useDownloadsSection } from './DownloadsSection.hooks';

export default function DownloadsSection() {
  const s = useDownloadsSection();

  const refreshButton = (
    <IconButton
      onClick={s.onRefresh}
      disabled={s.refreshDisabled}
      title={s.refreshTitle}
      aria-label={s.refreshTitle}
    >
      <RefreshCw className={cn(s.isRefreshing && 'animate-spin')} />
    </IconButton>
  );

  return (
    <>
      {s.showInstallOnePassCard && (
        <SettingsCard
          icon={ArrowDownToLine}
          title={s.installOnePassTitle}
          subtitle={s.installOnePassDesc}
        >
          {s.dependenciesInstalling ? (
            <InstallProgressBar
              percent={s.dependencyInstallProgress}
              caption={s.dependencyInstallCaption}
            />
          ) : (
            <Button
              type="button"
              onClick={s.onInstallMissingTools}
              className="rounded-xl [&_svg]:size-3.5"
            >
              <ArrowDownToLine />
              {s.installMissingLabel}
            </Button>
          )}
        </SettingsCard>
      )}

      <SettingsCard
        icon={ArrowDownToLine}
        title={s.title}
        subtitle={s.subtitle}
        headerRight={refreshButton}
      >
        <div className="space-y-3">
          {s.isCheckingDownloadTools ? (
            <DownloadsSectionSkeleton />
          ) : (
            <>
              <ToolStatusRow
                installed={s.ytdlpInstalled}
                installedTitle={s.ytdlpStatusInstalledTitle}
                notInstalledTitle={s.ytdlpStatusNotInstalledTitle}
                updateAvailable={s.ytdlpUpdateAvailable}
              />

              {s.ytdlpPath ? (
                <div className="px-3 py-2 rounded-xl bg-background/50 border border-border/20">
                  <p className="text-xs text-muted-foreground mb-1">{s.binaryPathLabel}</p>
                  <p className="text-xs text-foreground font-mono truncate">{s.ytdlpPath}</p>
                </div>
              ) : null}

              <ToolVersionBlock
                installedVersion={s.ytdlpInstalledVersionText}
                latestVersion={s.ytdlpLatestText}
              />

              <DownloadLocationPanel
                pathDisplay={s.locationPathDisplay}
                isDefault={s.downloadLocationIsDefault}
                updating={s.downloadLocationUpdating}
                onChange={s.onChangeDownloadLocation}
                onReset={s.onResetDownloadLocation}
              />

              {s.ytdlpInstalling ? (
                <InstallProgressBar
                  percent={s.ytdlpInstallProgress}
                  caption={s.ytdlpInstallCaption}
                  className="px-1"
                />
              ) : s.ytdlpInstalled && s.ytdlpUpdateAvailable ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={s.onInstallYtDlp}
                  className="rounded-xl [&_svg]:size-3.5"
                >
                  <Download />
                  {s.updateYtdlpLabel}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground/60 px-1">{s.ytdlpHint}</p>
              )}

              <div className="border-t border-border/20 pt-3 mt-3" />

              <ToolStatusRow
                installed={s.ffmpegInstalled}
                installedTitle={s.ffmpegStatusInstalledTitle}
                notInstalledTitle={s.ffmpegStatusNotInstalledTitle}
                updateAvailable={s.ffmpegUpdateAvailable}
                notInstalledRight={s.ffmpegRecommendedLabel}
              />

              <ToolVersionBlock
                installedVersion={s.ffmpegInstalledVersionText}
                latestVersion={s.ffmpegLatestText}
              />

              {!s.ffmpegInstalled && (
                <p className="text-xs text-muted-foreground/60 px-1">{s.ffmpegRecommendedNote}</p>
              )}

              {s.ffmpegInstalling ? (
                <InstallProgressBar
                  percent={s.ffmpegInstallProgress}
                  caption={s.ffmpegInstallCaption}
                  className="px-1"
                />
              ) : s.ffmpegInstalled && s.ffmpegUpdateAvailable ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={s.onInstallFfmpeg}
                  className="rounded-xl [&_svg]:size-3.5"
                >
                  <Download />
                  {s.updateFfmpegLabel}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground/60 px-1">{s.ffmpegHint}</p>
              )}
            </>
          )}
        </div>
      </SettingsCard>
    </>
  );
}
