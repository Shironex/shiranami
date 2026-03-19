import { useState, useEffect, useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { toast } from 'sonner';

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

  const isDependencyInstallInProgress = useDownloadStore((s) => s.isDependencyInstallInProgress);
  const dependencyInstallProgress = useDownloadStore((s) => s.dependencyInstallProgress);
  const dependencyInstallLabel = useDownloadStore((s) => s.dependencyInstallLabel);
  const startDependencyInstall = useDownloadStore((s) => s.startDependencyInstall);
  const stopDependencyInstall = useDownloadStore((s) => s.stopDependencyInstall);

  const isCheckingDownloadTools =
    ytdlpInstalled === null || ffmpegInstalled === null;
  const hasMissingDownloadTools =
    ytdlpInstalled === false || ffmpegInstalled === false;
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
        toast.success('yt-dlp installed successfully', { id: 'ytdlp-install' });
        await refreshDownloadToolStatus();
      } else {
        toast.error(`Failed to install yt-dlp: ${result.error ?? 'Unknown error'}`, {
          id: 'ytdlp-install',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Installation failed';
      toast.error(`Failed to install yt-dlp: ${msg}`, { id: 'ytdlp-install' });
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
        toast.success('ffmpeg installed successfully', { id: 'ffmpeg-install' });
        await refreshDownloadToolStatus();
      } else {
        toast.error(`Failed to install ffmpeg: ${result.error ?? 'Unknown error'}`, {
          id: 'ffmpeg-install',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Installation failed';
      toast.error(`Failed to install ffmpeg: ${msg}`, { id: 'ffmpeg-install' });
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
        toast.success('Download tools installed successfully', {
          id: 'dependency-install',
        });
      } else if (snapshot.ytdlpInstalled) {
        toast.error(result.error ?? 'ffmpeg could not be installed completely', {
          id: 'dependency-install',
        });
      } else {
        toast.error(result.error ?? 'Failed to install missing tools', {
          id: 'dependency-install',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Installation failed';
      toast.error(`Failed to install missing tools: ${msg}`, {
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
      toast.success('Download location updated', { id: 'download-location' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update download location';
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
      toast.success('Download location reset to default', { id: 'download-location' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset download location';
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
