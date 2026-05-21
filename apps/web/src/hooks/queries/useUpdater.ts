import { useMutation } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';

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
    onError: err => {
      console.warn('Failed to install update', err);
    },
  });
}
