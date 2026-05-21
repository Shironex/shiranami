import { useState, useEffect, useCallback, useRef } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';

type InstallStatus = 'idle' | 'downloading' | 'done' | 'error';
export type DependencyState = 'checking' | 'needs-install' | 'ready';

const READY_DELAY_MS = 700;

export function useSearchDependencies() {
  const [dependencyState, setDependencyState] = useState<DependencyState>('checking');
  const [dependencyInstallStatus, setDependencyInstallStatus] = useState<InstallStatus>('idle');
  const [dependencyInstallError, setDependencyInstallError] = useState<string | null>(null);
  const [dependenciesSnapshot, setDependenciesSnapshot] = useState<{
    ytdlpInstalled: boolean;
    ffmpegInstalled: boolean;
  } | null>(null);
  const readyTimeoutRef = useRef<number | null>(null);

  const isDependencyInstallInProgress = useDownloadStore(s => s.isDependencyInstallInProgress);
  const dependencyInstallProgress = useDownloadStore(s => s.dependencyInstallProgress);
  const dependencyInstallLabel = useDownloadStore(s => s.dependencyInstallLabel);
  const dependencyInstallTarget = useDownloadStore(s => s.dependencyInstallTarget);
  const startDependencyInstall = useDownloadStore(s => s.startDependencyInstall);
  const stopDependencyInstall = useDownloadStore(s => s.stopDependencyInstall);

  const refreshDependencies = useCallback(async () => {
    if (!IS_ELECTRON) {
      return { ytdlpInstalled: false, ffmpegInstalled: false };
    }

    try {
      const snapshot = await window.electronAPI.downloader.checkDependencies();
      setDependenciesSnapshot(snapshot);
      setDependencyState(snapshot.ytdlpInstalled ? 'ready' : 'needs-install');
      return snapshot;
    } catch {
      const snapshot = { ytdlpInstalled: false, ffmpegInstalled: false };
      setDependenciesSnapshot(snapshot);
      setDependencyState('needs-install');
      return snapshot;
    }
  }, []);

  // Check on mount
  useEffect(() => {
    if (!IS_ELECTRON) return;
    refreshDependencies();
  }, [refreshDependencies]);

  // Track install in progress
  useEffect(() => {
    if (!isDependencyInstallInProgress) return;
    setDependencyInstallStatus('downloading');
  }, [isDependencyInstallInProgress]);

  // Post-ffmpeg install
  useEffect(() => {
    if (!IS_ELECTRON) return;
    if (dependencyInstallTarget !== 'ffmpeg') return;

    let cancelled = false;
    refreshDependencies().then(snapshot => {
      if (cancelled || !snapshot.ytdlpInstalled) return;
      setDependencyState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [dependencyInstallTarget, refreshDependencies]);

  // Post-install validation
  useEffect(() => {
    if (!IS_ELECTRON) return;
    if (isDependencyInstallInProgress) return;
    if (dependencyInstallStatus !== 'downloading') return;

    let cancelled = false;
    refreshDependencies().then(snapshot => {
      if (cancelled) return;
      if (snapshot.ytdlpInstalled) {
        setDependencyInstallStatus('done');
        setDependencyInstallError(null);
        setDependencyState('ready');
        return;
      }
      setDependencyInstallStatus('error');
      setDependencyInstallError(i18n.t('installationFailed', { ns: 'toast' }));
      setDependencyState('needs-install');
    });
    return () => {
      cancelled = true;
    };
  }, [dependencyInstallStatus, isDependencyInstallInProgress, refreshDependencies]);

  // Clear the pending ready-state timer on unmount to avoid setting state
  // after the hook's owner has gone away.
  useEffect(() => {
    return () => {
      if (readyTimeoutRef.current !== null) {
        window.clearTimeout(readyTimeoutRef.current);
      }
    };
  }, []);

  const handleInstallDependencies = useCallback(async () => {
    if (!IS_ELECTRON) return;

    setDependencyInstallStatus('downloading');
    setDependencyInstallError(null);
    startDependencyInstall();

    try {
      const { results } = await window.electronAPI.downloader.installDependencies();
      const snapshot = await refreshDependencies();

      const ytdlpResult = results.find(r => r.tool === 'ytdlp');
      const ytdlpFailed = ytdlpResult && !ytdlpResult.success;

      if (!ytdlpFailed && snapshot.ytdlpInstalled) {
        setDependencyInstallStatus('done');
        toast.success(i18n.t('downloadToolsInstalled', { ns: 'toast' }), {
          id: 'dependency-install',
        });
        readyTimeoutRef.current = window.setTimeout(() => {
          setDependencyState('ready');
        }, READY_DELAY_MS);
        return;
      }

      const failedResults = results.filter(r => !r.success);
      const errorMsg =
        failedResults.length > 0
          ? failedResults
              .map(r => r.error ?? i18n.t('installationFailed', { ns: 'toast' }))
              .join('; ')
          : i18n.t('installationFailed', { ns: 'toast' });

      setDependencyInstallStatus('error');
      setDependencyInstallError(errorMsg);
      toast.error(i18n.t('failedInstallSearch', { ns: 'toast' }), { id: 'dependency-install' });
    } catch (err) {
      await refreshDependencies();
      const msg =
        err instanceof Error ? err.message : i18n.t('installationFailed', { ns: 'toast' });
      setDependencyInstallStatus('error');
      setDependencyInstallError(msg);
      toast.error(i18n.t('failedInstallSearchError', { ns: 'toast', error: msg }), {
        id: 'dependency-install',
      });
    } finally {
      stopDependencyInstall();
    }
  }, [refreshDependencies, startDependencyInstall, stopDependencyInstall]);

  return {
    dependencyState,
    dependencyInstallStatus,
    dependencyInstallError,
    dependenciesSnapshot,
    isDependencyInstallInProgress,
    dependencyInstallProgress,
    dependencyInstallLabel,
    dependencyInstallTarget,
    handleInstallDependencies,
  };
}
