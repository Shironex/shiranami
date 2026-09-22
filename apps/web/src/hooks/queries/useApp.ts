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
    // Placeholder, not `initialData`: initial data counts as fresh, and with an
    // infinite stale time the query then never ran, so every build showed
    // `apps/web`'s own version. That is the v1 line's 1.0.0, which v1 happened
    // to match and v2 does not.
    placeholderData: FALLBACK_VERSION,
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
