import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

export interface UseUpdaterEventsResult {
  status: UpdateStatus;
  version: string | null;
  progress: number;
  error: string | null;
  isMac: boolean;
  setStatus: (status: UpdateStatus) => void;
  setProgress: (progress: number) => void;
  setError: (error: string | null) => void;
}

/**
 * Subscribes to all updater event streams and exposes the current update state.
 * Also exposes setters so mutations can reflect optimistic state transitions
 * (matches the original UpdatesSection behavior).
 */
export function useUpdaterEvents(): UseUpdaterEventsResult {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const isMac = IS_ELECTRON && window.electronAPI.platform === 'darwin';

  const unsubsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const updater = window.electronAPI.updater;

    unsubsRef.current = [
      updater.onCheckingForUpdate(() => {
        setStatus('checking');
        setError(null);
      }),
      updater.onUpdateAvailable((info) => {
        setStatus('available');
        setVersion(info.version);
        setError(null);
      }),
      updater.onUpdateNotAvailable(() => {
        setStatus('idle');
        setError(null);
      }),
      updater.onDownloadProgress((p) => {
        setStatus('downloading');
        setProgress(Math.round(p.percent));
      }),
      updater.onUpdateDownloaded((info) => {
        setStatus('ready');
        setVersion(info.version);
      }),
      updater.onUpdateError((message) => {
        if (message === 'RELEASE_PENDING') {
          setStatus('idle');
          setError(null);
        } else {
          setStatus('error');
          setError(message);
        }
      }),
    ];

    return () => {
      unsubsRef.current.forEach((fn) => fn());
      unsubsRef.current = [];
    };
  }, []);

  return {
    status,
    version,
    progress,
    error,
    isMac,
    setStatus,
    setProgress,
    setError,
  };
}

export function useCheckForUpdatesMutation() {
  return useMutation({
    mutationFn: async () => {
      if (!IS_ELECTRON) return { enabled: false };
      return window.electronAPI.updater.checkForUpdates();
    },
  });
}

export function useStartUpdateDownloadMutation() {
  return useMutation({
    mutationFn: async () => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.updater.startDownload();
    },
  });
}

export function useInstallUpdateMutation() {
  return useMutation({
    mutationFn: async () => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.updater.installNow();
    },
    onError: (err) => {
      console.warn('Failed to install update', err);
    },
  });
}

/**
 * Convenience re-export so consumers can import everything from one place.
 */
export const useUpdater = () => {
  const events = useUpdaterEvents();
  const check = useCheckForUpdatesMutation();
  const download = useStartUpdateDownloadMutation();
  const install = useInstallUpdateMutation();
  return { ...events, check, download, install };
};
