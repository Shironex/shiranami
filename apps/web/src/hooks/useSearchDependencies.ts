import { useState, useEffect, useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { toast } from 'sonner';

type InstallStatus = 'idle' | 'downloading' | 'done' | 'error';
export type DependencyState = 'checking' | 'needs-install' | 'ready';

export function useSearchDependencies() {
  const [dependencyState, setDependencyState] = useState<DependencyState>('checking');
  const [dependencyInstallStatus, setDependencyInstallStatus] = useState<InstallStatus>('idle');
  const [dependencyInstallError, setDependencyInstallError] = useState<string | null>(null);
  const [dependenciesSnapshot, setDependenciesSnapshot] = useState<{
    ytdlpInstalled: boolean;
    ffmpegInstalled: boolean;
  } | null>(null);

  const isDependencyInstallInProgress = useDownloadStore((s) => s.isDependencyInstallInProgress);
  const dependencyInstallProgress = useDownloadStore((s) => s.dependencyInstallProgress);
  const dependencyInstallLabel = useDownloadStore((s) => s.dependencyInstallLabel);
  const dependencyInstallTarget = useDownloadStore((s) => s.dependencyInstallTarget);
  const startDependencyInstall = useDownloadStore((s) => s.startDependencyInstall);
  const stopDependencyInstall = useDownloadStore((s) => s.stopDependencyInstall);

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
    refreshDependencies().then((snapshot) => {
      if (cancelled || !snapshot.ytdlpInstalled) return;
      setDependencyState('ready');
    });
    return () => { cancelled = true; };
  }, [dependencyInstallTarget, refreshDependencies]);

  // Post-install validation
  useEffect(() => {
    if (!IS_ELECTRON) return;
    if (isDependencyInstallInProgress) return;
    if (dependencyInstallStatus !== 'downloading') return;

    let cancelled = false;
    refreshDependencies().then((snapshot) => {
      if (cancelled) return;
      if (snapshot.ytdlpInstalled) {
        setDependencyInstallStatus('done');
        setDependencyInstallError(null);
        setDependencyState('ready');
        return;
      }
      setDependencyInstallStatus('error');
      setDependencyInstallError('Installation failed');
      setDependencyState('needs-install');
    });
    return () => { cancelled = true; };
  }, [dependencyInstallStatus, isDependencyInstallInProgress, refreshDependencies]);

  const handleInstallDependencies = useCallback(async () => {
    if (!IS_ELECTRON) return;

    setDependencyInstallStatus('downloading');
    setDependencyInstallError(null);
    startDependencyInstall();

    try {
      const result = await window.electronAPI.downloader.installDependencies();
      const snapshot = await refreshDependencies();

      if (snapshot.ytdlpInstalled) {
        setDependencyInstallStatus('done');

        if (result.success) {
          toast.success('Download tools installed successfully', { id: 'dependency-install' });
        } else {
          toast.error(result.error ?? 'ffmpeg could not be installed completely', { id: 'dependency-install' });
        }

        window.setTimeout(() => { setDependencyState('ready'); }, 700);
        return;
      }

      setDependencyInstallStatus('error');
      setDependencyInstallError(result.error ?? 'Installation failed');
      toast.error(result.error ?? 'Failed to install search tools', { id: 'dependency-install' });
    } catch (err) {
      await refreshDependencies();
      const msg = err instanceof Error ? err.message : 'Installation failed';
      setDependencyInstallStatus('error');
      setDependencyInstallError(msg);
      toast.error(`Failed to install search tools: ${msg}`, { id: 'dependency-install' });
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
