import { useTranslation } from 'react-i18next';
import { useDownloadsSettings } from '@/components/settings/downloads/useDownloadsSettings';
import { useToolAutoUpdate } from '@/components/settings/downloads/useToolAutoUpdate';
import type { IDownloadsSectionView } from './DownloadsSection.types';

/**
 * Wraps the shared `useDownloadsSettings` hook and binds the `settings`
 * translator, pre-composing every derived label, version text, and progress
 * caption so the section shell stays a thin, logic-free render.
 */
export function useDownloadsSection(): IDownloadsSectionView {
  const { t } = useTranslation('settings');
  const s = useDownloadsSettings();
  // An automatic update while the card is open refreshes the version rows.
  const autoUpdate = useToolAutoUpdate(s.handleRefresh);

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

  const ytdlpHint = s.ytdlpInstalled ? t('dl.ytdlpLatest') : t('dl.ytdlpInstallHint');
  const ffmpegHint = s.ffmpegInstalled ? t('dl.ffmpegLatest') : t('dl.ffmpegInstallHint');

  const dependencyInstallCaption = `${s.dependencyInstallLabel}... ${s.dependencyInstallProgress}%`;
  const ytdlpInstallCaption = `${t('dl.downloadingYtdlp')} ${s.ytdlpInstallProgress}%`;
  const ffmpegInstallCaption = `${t('dl.downloadingFfmpeg')} ${s.ffmpegInstallProgress}%`;

  return {
    isCheckingDownloadTools: s.isCheckingDownloadTools,
    hasMissingDownloadTools: s.hasMissingDownloadTools,
    showInstallOnePassCard: !s.isCheckingDownloadTools && s.hasMissingDownloadTools,
    dependenciesInstalling: s.dependenciesInstalling,
    dependencyInstallProgress: s.dependencyInstallProgress,
    dependencyInstallCaption,
    refreshDisabled: s.isRefreshing || s.isCheckingDownloadTools,
    isRefreshing: s.isRefreshing,

    ytdlpInstalled: Boolean(s.ytdlpInstalled),
    ytdlpUpdateAvailable: s.ytdlpUpdateAvailable,
    ytdlpPath: s.ytdlpPath,
    ytdlpInstalling: s.ytdlpInstalling,
    ytdlpInstallProgress: s.ytdlpInstallProgress,
    ytdlpInstallCaption,
    ytdlpInstalledVersionText,
    ytdlpLatestText,
    ytdlpHint,

    ffmpegInstalled: Boolean(s.ffmpegInstalled),
    ffmpegUpdateAvailable: s.ffmpegUpdateAvailable,
    ffmpegInstalling: s.ffmpegInstalling,
    ffmpegInstallProgress: s.ffmpegInstallProgress,
    ffmpegInstallCaption,
    ffmpegInstalledVersionText,
    ffmpegLatestText,
    ffmpegHint,

    autoUpdate: {
      enabled: autoUpdate.enabled,
      disabled: autoUpdate.disabled,
      onEnabledChange: autoUpdate.setEnabled,
      record: autoUpdate.record,
      ffmpegIncluded: autoUpdate.ffmpegIncluded,
    },
    // Another install of the tool is running (an automatic update, or an
    // install started elsewhere), and a click would only queue behind it, so
    // the button makes way for a neutral note until it finishes. ffmpeg on
    // macOS is never updated automatically, so it never gets the note there.
    ytdlpAutoInstalling: autoUpdate.ytdlpInstalling,
    ffmpegAutoInstalling: autoUpdate.ffmpegIncluded && autoUpdate.ffmpegInstalling,
    autoInstallingHint: t('dl.autoUpdate.inProgress'),

    locationPathDisplay,
    downloadLocationIsDefault: s.downloadLocationIsDefault,
    downloadLocationUpdating: s.downloadLocationUpdating,

    installOnePassTitle: t('dl.installOnePassTitle'),
    installOnePassDesc: t('dl.installOnePassDesc'),
    installMissingLabel: t('dl.installMissing'),
    title: t('dl.title'),
    subtitle: t('dl.subtitle'),
    refreshTitle: t('dl.refresh'),
    binaryPathLabel: t('dl.binaryPath'),
    updateYtdlpLabel: t('dl.updateYtdlp'),
    updateFfmpegLabel: t('dl.updateFfmpeg'),
    ytdlpStatusInstalledTitle: t('dl.ytdlpInstalled'),
    ytdlpStatusNotInstalledTitle: t('dl.ytdlpNotInstalled'),
    ffmpegStatusInstalledTitle: t('dl.ffmpegInstalled'),
    ffmpegStatusNotInstalledTitle: t('dl.ffmpegNotInstalled'),
    ffmpegRecommendedLabel: t('dl.recommended'),
    ffmpegRecommendedNote: t('dl.ffmpegRecommendedNote'),

    onInstallMissingTools: s.handleInstallMissingTools,
    onRefresh: s.handleRefresh,
    onInstallYtDlp: s.handleInstallYtDlp,
    onInstallFfmpeg: s.handleInstallFfmpeg,
    onChangeDownloadLocation: s.handleChangeDownloadLocation,
    onResetDownloadLocation: s.handleResetDownloadLocation,
  };
}
