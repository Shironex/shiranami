import { useState, useEffect, useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';

const UNKNOWN_ERROR = () => i18n.t('unknownError', { ns: 'common' });

export function useDownloadsSettings() {
  const [ytdlpInstalled, setYtdlpInstalled] = useState<boolean | null>(null);
  const [ytdlpVersion, setYtdlpVersion] = useState<string | undefined>();
  const [ytdlpLatestVersion, setYtdlpLatestVersion] = useState<string | undefined>();
  const [ytdlpUpdateAvailable, setYtdlpUpdateAvailable] = useState(false);
  const [ytdlpPath, setYtdlpPath] = useState<string>('');
  const [ytdlpInstalling, setYtdlpInstalling] = useState(false);
  const [ytdlpInstallProgress, setYtdlpInstallProgress] = useState(0);

  const [ffmpegInstalled, setFfmpegInstalled] = useState<boolean | null>(null);
  const [ffmpegVersion, setFfmpegVersion] = useState<string | undefined>();
  const [ffmpegLatestVersion, setFfmpegLatestVersion] = useState<string | undefined>();
  const [ffmpegUpdateAvailable, setFfmpegUpdateAvailable] = useState(false);
  const [ffmpegInstalling, setFfmpegInstalling] = useState(false);
  const [ffmpegInstallProgress, setFfmpegInstallProgress] = useState(0);

  const [downloadLocation, setDownloadLocation] = useState('');
  const [downloadLocationDefaultPath, setDownloadLocationDefaultPath] = useState('');
  const [downloadLocationIsDefault, setDownloadLocationIsDefault] = useState(true);
  const [downloadLocationUpdating, setDownloadLocationUpdating] = useState(false);

  const isDependencyInstallInProgress = useDownloadStore(s => s.isDependencyInstallInProgress);
  const dependencyInstallProgress = useDownloadStore(s => s.dependencyInstallProgress);
  const dependencyInstallLabel = useDownloadStore(s => s.dependencyInstallLabel);
  const startDependencyInstall = useDownloadStore(s => s.startDependencyInstall);
  const stopDependencyInstall = useDownloadStore(s => s.stopDependencyInstall);

  const isCheckingDownloadTools = ytdlpInstalled === null || ffmpegInstalled === null;
  const hasMissingDownloadTools = ytdlpInstalled === false || ffmpegInstalled === false;
  const dependenciesInstalling = isDependencyInstallInProgress;

  const refreshDownloadToolStatus = useCallback(async () => {
    if (!IS_ELECTRON) {
      return {
        ytdlpInstalled: false,
        ffmpegInstalled: false,
      };
    }

    try {
      const [ytdlpResult, binPath, ffmpegResult, downloadLocationResult] = await Promise.all([
        window.electronAPI.downloader.check(),
        window.electronAPI.downloader.getYtDlpPath(),
        window.electronAPI.downloader.checkFfmpeg(),
        window.electronAPI.downloader.getDownloadLocation(),
      ]);

      setYtdlpInstalled(ytdlpResult.installed);
      setYtdlpVersion(ytdlpResult.version);
      setYtdlpLatestVersion(ytdlpResult.latestVersion);
      setYtdlpUpdateAvailable(Boolean(ytdlpResult.updateAvailable));
      setYtdlpPath(binPath);

      setFfmpegInstalled(ffmpegResult.installed);
      setFfmpegVersion(ffmpegResult.version);
      setFfmpegLatestVersion(ffmpegResult.latestVersion);
      setFfmpegUpdateAvailable(Boolean(ffmpegResult.updateAvailable));
      setDownloadLocation(downloadLocationResult.path);
      setDownloadLocationDefaultPath(downloadLocationResult.defaultPath);
      setDownloadLocationIsDefault(downloadLocationResult.isDefault);

      return {
        ytdlpInstalled: ytdlpResult.installed,
        ffmpegInstalled: ffmpegResult.installed,
      };
    } catch {
      setYtdlpInstalled(false);
      setYtdlpVersion(undefined);
      setYtdlpLatestVersion(undefined);
      setYtdlpUpdateAvailable(false);
      setFfmpegInstalled(false);
      setFfmpegVersion(undefined);
      setFfmpegLatestVersion(undefined);
      setFfmpegUpdateAvailable(false);
      setDownloadLocation('');
      setDownloadLocationDefaultPath('');
      setDownloadLocationIsDefault(true);
      return {
        ytdlpInstalled: false,
        ffmpegInstalled: false,
      };
    }
  }, []);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    refreshDownloadToolStatus();
  }, [refreshDownloadToolStatus]);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onInstallProgress(
      (progress: { percent: number }) => {
        setYtdlpInstallProgress(progress.percent);
      }
    );
    return cleanup;
  }, []);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onFfmpegInstallProgress(
      (progress: { percent: number }) => {
        setFfmpegInstallProgress(progress.percent);
      }
    );
    return cleanup;
  }, []);

  const handleInstallYtDlp = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setYtdlpInstalling(true);
    setYtdlpInstallProgress(0);

    try {
      const result = await window.electronAPI.downloader.installYtDlp();
      if (result.success) {
        toast.success(i18n.t('ytdlpInstalled', { ns: 'toast' }), { id: 'ytdlp-install' });
        await refreshDownloadToolStatus();
      } else {
        toast.error(
          i18n.t('failedInstallYtdlp', { ns: 'toast', error: result.error ?? UNKNOWN_ERROR() }),
          {
            id: 'ytdlp-install',
          }
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : i18n.t('installationFailed', { ns: 'toast' });
      toast.error(i18n.t('failedInstallYtdlp', { ns: 'toast', error: msg }), {
        id: 'ytdlp-install',
      });
    } finally {
      setYtdlpInstalling(false);
    }
  }, [refreshDownloadToolStatus]);

  const handleInstallFfmpeg = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setFfmpegInstalling(true);
    setFfmpegInstallProgress(0);

    try {
      const result = await window.electronAPI.downloader.installFfmpeg();
      if (result.success) {
        toast.success(i18n.t('ffmpegInstalled', { ns: 'toast' }), { id: 'ffmpeg-install' });
        await refreshDownloadToolStatus();
      } else {
        toast.error(
          i18n.t('failedInstallFfmpeg', { ns: 'toast', error: result.error ?? UNKNOWN_ERROR() }),
          {
            id: 'ffmpeg-install',
          }
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : i18n.t('installationFailed', { ns: 'toast' });
      toast.error(i18n.t('failedInstallFfmpeg', { ns: 'toast', error: msg }), {
        id: 'ffmpeg-install',
      });
    } finally {
      setFfmpegInstalling(false);
    }
  }, [refreshDownloadToolStatus]);

  const handleInstallMissingTools = useCallback(async () => {
    if (!IS_ELECTRON) return;
    startDependencyInstall();

    try {
      const result = await window.electronAPI.downloader.installDependencies();
      const snapshot = await refreshDownloadToolStatus();

      if (result.success) {
        toast.success(i18n.t('downloadToolsInstalled', { ns: 'toast' }), {
          id: 'dependency-install',
        });
      } else if (snapshot.ytdlpInstalled) {
        toast.error(result.error ?? i18n.t('failedInstallFfmpeg', { ns: 'toast', error: '' }), {
          id: 'dependency-install',
        });
      } else {
        toast.error(result.error ?? i18n.t('failedInstallTools', { ns: 'toast' }), {
          id: 'dependency-install',
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : i18n.t('installationFailed', { ns: 'toast' });
      toast.error(i18n.t('failedInstallToolsError', { ns: 'toast', error: msg }), {
        id: 'dependency-install',
      });
      await refreshDownloadToolStatus();
    } finally {
      stopDependencyInstall();
    }
  }, [refreshDownloadToolStatus, startDependencyInstall, stopDependencyInstall]);

  const handleChangeDownloadLocation = useCallback(async () => {
    if (!IS_ELECTRON) return;

    try {
      const dirPath = await window.electronAPI.dialog.openDirectory();
      if (!dirPath) return;

      setDownloadLocationUpdating(true);
      const result = await window.electronAPI.downloader.setDownloadLocation(dirPath);
      setDownloadLocation(result.path);
      setDownloadLocationDefaultPath(result.defaultPath);
      setDownloadLocationIsDefault(result.isDefault);
      toast.success(i18n.t('downloadLocationUpdated', { ns: 'toast' }), {
        id: 'download-location',
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : i18n.t('failedUpdateDownloadLocation', { ns: 'toast' });
      toast.error(message, { id: 'download-location' });
    } finally {
      setDownloadLocationUpdating(false);
    }
  }, []);

  const handleResetDownloadLocation = useCallback(async () => {
    if (!IS_ELECTRON) return;

    try {
      setDownloadLocationUpdating(true);
      const result = await window.electronAPI.downloader.setDownloadLocation(null);
      setDownloadLocation(result.path);
      setDownloadLocationDefaultPath(result.defaultPath);
      setDownloadLocationIsDefault(result.isDefault);
      toast.success(i18n.t('downloadLocationReset', { ns: 'toast' }), { id: 'download-location' });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : i18n.t('failedResetDownloadLocation', { ns: 'toast' });
      toast.error(message, { id: 'download-location' });
    } finally {
      setDownloadLocationUpdating(false);
    }
  }, []);

  return {
    isCheckingDownloadTools,
    hasMissingDownloadTools,
    dependenciesInstalling,
    dependencyInstallProgress,
    dependencyInstallLabel,
    handleInstallMissingTools,
    ytdlpInstalled,
    ytdlpVersion,
    ytdlpLatestVersion,
    ytdlpUpdateAvailable,
    ytdlpPath,
    ytdlpInstalling,
    ytdlpInstallProgress,
    handleInstallYtDlp,
    ffmpegInstalled,
    ffmpegVersion,
    ffmpegLatestVersion,
    ffmpegUpdateAvailable,
    ffmpegInstalling,
    ffmpegInstallProgress,
    handleInstallFfmpeg,
    downloadLocation,
    downloadLocationDefaultPath,
    downloadLocationIsDefault,
    downloadLocationUpdating,
    handleChangeDownloadLocation,
    handleResetDownloadLocation,
  };
}
