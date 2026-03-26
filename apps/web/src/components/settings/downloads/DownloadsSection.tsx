import { useTranslation } from 'react-i18next';
import {
  ArrowDownToLine,
  Download,
  Loader2,
} from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { DownloadLocationPanel } from '@/components/settings/downloads/DownloadLocationPanel';
import { InstallProgressBar } from '@/components/settings/downloads/InstallProgressBar';
import { ToolStatusRow } from '@/components/settings/downloads/ToolStatusRow';
import { ToolVersionBlock } from '@/components/settings/downloads/ToolVersionBlock';
import { useDownloadsSettings } from '@/components/settings/downloads/useDownloadsSettings';

export function DownloadsSection() {
  const { t } = useTranslation('settings');
  const s = useDownloadsSettings();

  const ytdlpInstalledVersionText = s.ytdlpVersion
    ? `v${s.ytdlpVersion}`
    : s.ytdlpInstalled
      ? t('dl.unknown')
      : t('dl.notInstalled');
  const ytdlpLatestText = s.ytdlpLatestVersion ? `v${s.ytdlpLatestVersion}` : null;

  const ffmpegInstalledVersionText =
    s.ffmpegVersion ?? (s.ffmpegInstalled ? t('dl.unknown') : t('dl.notInstalled'));
  const ffmpegLatestText = s.ffmpegLatestVersion ?? null;

  const locationPathDisplay =
    s.downloadLocation || s.downloadLocationDefaultPath || t('dl.checking');

  return (
    <SettingsCard
      icon={ArrowDownToLine}
      title={t('dl.title')}
      subtitle={t('dl.subtitle')}
    >
      <div className="space-y-3">
        {s.isCheckingDownloadTools ? (
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-background/50 border border-border/20 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{t('dl.checking')}</span>
          </div>
        ) : (
          <>
            {s.hasMissingDownloadTools && (
              <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {t('dl.installOnePassTitle')}
                  </p>
                  <p className="text-xs text-muted-foreground leading-5">
                    {t('dl.installOnePassDesc')}
                  </p>
                </div>

                {s.dependenciesInstalling ? (
                  <InstallProgressBar
                    percent={s.dependencyInstallProgress}
                    caption={`${s.dependencyInstallLabel}... ${s.dependencyInstallProgress}%`}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={s.handleInstallMissingTools}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    {t('dl.installMissing')}
                  </button>
                )}
              </div>
            )}

            <ToolStatusRow
              installed={Boolean(s.ytdlpInstalled)}
              installedTitle={t('dl.ytdlpInstalled')}
              notInstalledTitle={t('dl.ytdlpNotInstalled')}
              updateAvailable={s.ytdlpUpdateAvailable}
            />

            {s.ytdlpPath ? (
              <div className="px-3 py-2 rounded-xl bg-background/50 border border-border/20">
                <p className="text-xs text-muted-foreground mb-1">{t('dl.binaryPath')}</p>
                <p className="text-xs text-foreground font-mono truncate">{s.ytdlpPath}</p>
              </div>
            ) : null}

            <ToolVersionBlock
              installedVersion={ytdlpInstalledVersionText}
              latestVersion={ytdlpLatestText}
            />

            <DownloadLocationPanel
              pathDisplay={locationPathDisplay}
              isDefault={s.downloadLocationIsDefault}
              updating={s.downloadLocationUpdating}
              onChange={s.handleChangeDownloadLocation}
              onReset={s.handleResetDownloadLocation}
            />

            {s.ytdlpInstalling ? (
              <InstallProgressBar
                percent={s.ytdlpInstallProgress}
                caption={`${t('dl.downloadingYtdlp')} ${s.ytdlpInstallProgress}%`}
                className="px-1"
              />
            ) : s.ytdlpInstalled && s.ytdlpUpdateAvailable ? (
              <button
                type="button"
                onClick={s.handleInstallYtDlp}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t('dl.updateYtdlp')}
              </button>
            ) : (
              <p className="text-xs text-muted-foreground/60 px-1">
                {s.ytdlpInstalled
                  ? t('dl.ytdlpLatest')
                  : t('dl.ytdlpInstallHint')}
              </p>
            )}

            <div className="border-t border-border/20 pt-3 mt-3" />

            <ToolStatusRow
              installed={Boolean(s.ffmpegInstalled)}
              installedTitle={t('dl.ffmpegInstalled')}
              notInstalledTitle={t('dl.ffmpegNotInstalled')}
              updateAvailable={s.ffmpegUpdateAvailable}
              notInstalledRight={t('dl.recommended')}
            />

            <ToolVersionBlock
              installedVersion={ffmpegInstalledVersionText}
              latestVersion={ffmpegLatestText}
            />

            {!s.ffmpegInstalled && (
              <p className="text-xs text-muted-foreground/60 px-1">
                {t('dl.ffmpegRecommendedNote')}
              </p>
            )}

            {s.ffmpegInstalling ? (
              <InstallProgressBar
                percent={s.ffmpegInstallProgress}
                caption={`${t('dl.downloadingFfmpeg')} ${s.ffmpegInstallProgress}%`}
                className="px-1"
              />
            ) : s.ffmpegInstalled && s.ffmpegUpdateAvailable ? (
              <button
                type="button"
                onClick={s.handleInstallFfmpeg}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t('dl.updateFfmpeg')}
              </button>
            ) : (
              <p className="text-xs text-muted-foreground/60 px-1">
                {s.ffmpegInstalled
                  ? t('dl.ffmpegLatest')
                  : t('dl.ffmpegInstallHint')}
              </p>
            )}
          </>
        )}
      </div>
    </SettingsCard>
  );
}
