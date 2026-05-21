import { useMutation, useQuery } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { IS_ELECTRON } from '@/lib/platform';
import appPackage from '../../../package.json';

const FALLBACK_VERSION = appPackage.version;

export const appKeys = {
  all: ['app'] as const,
  version: () => ['app', 'version'] as const,
};

export function useAppVersionQuery() {
  return useQuery({
    queryKey: appKeys.version(),
    queryFn: async () => {
      if (!IS_ELECTRON) return FALLBACK_VERSION;
      try {
        return await window.electronAPI.app.getVersion();
      } catch (err) {
        logger.error('Failed to load app version:', err);
        return FALLBACK_VERSION;
      }
    },
    initialData: FALLBACK_VERSION,
    staleTime: Infinity,
  });
}

export function useOpenLogsFolderMutation() {
  return useMutation({
    mutationFn: async () => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.app.openLogsFolder();
    },
    onError: err => {
      logger.warn('Failed to open logs folder', err);
    },
  });
}
