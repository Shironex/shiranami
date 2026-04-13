import { useState, useEffect, useCallback, useRef } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';

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

  const [isRefreshing, setIsRefreshing] = useState(false);

  const isDependencyInstallInProgress = useDownloadStore(s => s.isDependencyInstallInProgress);
  const dependencyInstallProgress = useDownloadStore(s => s.dependencyInstallProgress);
  const dependencyInstallLabel = useDownloadStore(s => s.dependencyInstallLabel);
  const startDependencyInstall = useDownloadStore(s => s.startDependencyInstall);
  const stopDependencyInstall = useDownloadStore(s => s.stopDependencyInstall);

  const isCheckingDownloadTools = ytdlpInstalled === null || ffmpegInstalled === null;
  const hasMissingDownloadTools = ytdlpInstalled === false || ffmpegInstalled === false;
  const dependenciesInstalling = isDependencyInstallInProgress;

  const mountedRef = useRef(true);

  const applyCacheSnapshot = useCallback((cache: {
    ytdlp: { installed: boolean; version?: string; latestVersion?: string; updateAvailable?: boolean };
    ffmpeg: { installed: boolean; version?: string; latestVersion?: string; updateAvailable?: boolean };
    ytdlpPath: string;
    downloadLocation: { path: string; defaultPath: string; isDefault: boolean };
  }) => {
    setYtdlpInstalled(cache.ytdlp.installed);
    setYtdlpVersion(cache.ytdlp.version);
    setYtdlpLatestVersion(cache.ytdlp.latestVersion);
    setYtdlpUpdateAvailable(Boolean(cache.ytdlp.updateAvailable));
    setYtdlpPath(cache.ytdlpPath);

    setFfmpegInstalled(cache.ffmpeg.installed);
    setFfmpegVersion(cache.ffmpeg.version);
    setFfmpegLatestVersion(cache.ffmpeg.latestVersion);
    setFfmpegUpdateAvailable(Boolean(cache.ffmpeg.updateAvailable));

    setDownloadLocation(cache.downloadLocation.path);
    setDownloadLocationDefaultPath(cache.downloadLocation.defaultPath);
    setDownloadLocationIsDefault(cache.downloadLocation.isDefault);
  }, []);

  const refreshDownloadToolStatus = useCallback(async () => {
    if (!IS_ELECTRON) {
      return { ytdlpInstalled: false, ffmpegInstalled: false };
    }

    try {
      const result = await window.electronAPI.downloader.refreshToolStatus();
      if (!mountedRef.current) return { ytdlpInstalled: false, ffmpegInstalled: false };

      if (result) {
        applyCacheSnapshot(result);
        return {
          ytdlpInstalled: result.ytdlp.installed,
          ffmpegInstalled: result.ffmpeg.installed,
        };
      }

      return { ytdlpInstalled: false, ffmpegInstalled: false };
    } catch {
      if (!mountedRef.current) return { ytdlpInstalled: false, ffmpegInstalled: false };

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
      return { ytdlpInstalled: false, ffmpegInstalled: false };
    }
  }, [applyCacheSnapshot]);

  const handleRefresh = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setIsRefreshing(true);
    try {
      await refreshDownloadToolStatus();
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  }, [refreshDownloadToolStatus]);

  // On mount: load cached data instantly, then background refresh
  useEffect(() => {
    mountedRef.current = true;
    if (!IS_ELECTRON) return;

    let cancelled = false;

    (async () => {
      // Step 1: Try loading cached data for instant display
      try {
        const cached = await window.electronAPI.downloader.getCachedToolStatus();
        if (cached && !cancelled) {
          applyCacheSnapshot(cached);
        }
      } catch {
        // no cache available, will show skeleton
      }

      // Step 2: Background refresh to get fresh data
      if (!cancelled) {
        setIsRefreshing(true);
        try {
          const fresh = await window.electronAPI.downloader.refreshToolStatus();
          if (fresh && !cancelled) {
            applyCacheSnapshot(fresh);
          }
        } catch {
          // cache already applied if available
        } finally {
          if (!cancelled) setIsRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [applyCacheSnapshot]);

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
      await window.electronAPI.downloader.installYtDlp();
      toast.success(i18n.t('ytdlpInstalled', { ns: 'toast' }), { id: 'ytdlp-install' });
      await refreshDownloadToolStatus();
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
      await window.electronAPI.downloader.installFfmpeg();
      toast.success(i18n.t('ffmpegInstalled', { ns: 'toast' }), { id: 'ffmpeg-install' });
      await refreshDownloadToolStatus();
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
      const { results } = await window.electronAPI.downloader.installDependencies();
      await refreshDownloadToolStatus();

      const failed = results.filter((r) => !r.success);
      const succeeded = results.filter((r) => r.success);

      if (failed.length === 0) {
        toast.success(i18n.t('downloadToolsInstalled', { ns: 'toast' }), {
          id: 'dependency-install',
        });
      } else {
        for (const r of failed) {
          const toolName = r.tool === 'ytdlp' ? 'yt-dlp' : 'ffmpeg';
          const msg = r.error ?? i18n.t('installationFailed', { ns: 'toast' });
          toast.error(i18n.t('failedInstallToolsError', { ns: 'toast', error: `${toolName}: ${msg}` }), {
            id: `dependency-install-${r.tool}`,
          });
        }
        if (succeeded.length > 0) {
          const names = succeeded.map((r) => (r.tool === 'ytdlp' ? 'yt-dlp' : 'ffmpeg')).join(', ');
          toast.success(i18n.t('downloadToolsInstalled', { ns: 'toast' }) + ` (${names})`, {
            id: 'dependency-install-partial',
          });
        }
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
    isRefreshing,
    hasMissingDownloadTools,
    dependenciesInstalling,
    dependencyInstallProgress,
    dependencyInstallLabel,
    handleInstallMissingTools,
    handleRefresh,
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
