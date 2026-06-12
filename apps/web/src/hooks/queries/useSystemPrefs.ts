import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';

/**
 * System behavior prefs stored as individual `system.*` electron-store keys
 * (not the renderer-owned `settings` blob) because the MAIN process consumes
 * them: login-item registration and tray window behavior in
 * system-behavior.ts. Defaults are implicit `undefined` → off.
 */

export interface SystemPrefs {
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
}

export type SystemPrefKey = keyof SystemPrefs;

const STORE_KEY_BY_PREF: Record<SystemPrefKey, string> = {
  launchAtStartup: 'system.launchAtStartup',
  minimizeToTray: 'system.minimizeToTray',
  closeToTray: 'system.closeToTray',
};

export const systemPrefsKeys = {
  all: ['system-prefs'] as const,
};

export function useSystemPrefsQuery() {
  return useQuery({
    queryKey: systemPrefsKeys.all,
    queryFn: async (): Promise<SystemPrefs> => {
      const [launchAtStartup, minimizeToTray, closeToTray] = await Promise.all([
        window.electronAPI.store.get<boolean>(STORE_KEY_BY_PREF.launchAtStartup),
        window.electronAPI.store.get<boolean>(STORE_KEY_BY_PREF.minimizeToTray),
        window.electronAPI.store.get<boolean>(STORE_KEY_BY_PREF.closeToTray),
      ]);
      return {
        launchAtStartup: launchAtStartup === true,
        minimizeToTray: minimizeToTray === true,
        closeToTray: closeToTray === true,
      };
    },
    enabled: IS_ELECTRON,
    staleTime: Infinity,
  });
}

export function useUpdateSystemPrefMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ key, value }: { key: SystemPrefKey; value: boolean }) => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.store.set(STORE_KEY_BY_PREF[key], value);
    },
    // Optimistic flip so the switch tracks the click; rolled back by the
    // invalidate below if the write fails.
    onMutate: async ({ key, value }) => {
      await queryClient.cancelQueries({ queryKey: systemPrefsKeys.all });
      const previous = queryClient.getQueryData<SystemPrefs>(systemPrefsKeys.all);
      if (previous) {
        queryClient.setQueryData<SystemPrefs>(systemPrefsKeys.all, { ...previous, [key]: value });
      }
    },
    onError: () => {
      toast.error(i18n.t('failedSaveSettings', { ns: 'toast' }));
      queryClient.invalidateQueries({ queryKey: systemPrefsKeys.all });
    },
  });
}
