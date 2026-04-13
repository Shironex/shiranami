import { useMutation } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';

export { useAppVersion } from '@/hooks/useAppVersion';

export function useOpenLogsFolderMutation() {
  return useMutation({
    mutationFn: async () => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.app.openLogsFolder();
    },
    onError: (err) => {
      console.warn('Failed to open logs folder', err);
    },
  });
}

export function useAbout() {
  const openLogsFolder = useOpenLogsFolderMutation();
  return { openLogsFolder };
}
