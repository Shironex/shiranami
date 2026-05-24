import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';

export interface ElectronSettings {
  rememberPlaybackPosition?: boolean;
  [key: string]: unknown;
}

export const settingsKeys = {
  all: ['settings'] as const,
};

export function useSettingsQuery() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: async () => {
      if (!IS_ELECTRON) return null;
      const saved = await window.electronAPI.store.get<ElectronSettings>('settings');
      return saved ?? null;
    },
    enabled: IS_ELECTRON,
    staleTime: Infinity,
  });
}

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<ElectronSettings>) => {
      if (!IS_ELECTRON) return;
      const current = queryClient.getQueryData<ElectronSettings | null>(settingsKeys.all) ?? {};
      const merged: ElectronSettings = { ...current, ...patch };
      await window.electronAPI.store.set('settings', merged);
      return merged;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    // Fire-and-forget callers (settings toggles, onboarding) have no local
    // catch, so surface the failure here and resync the cache to truth.
    onError: () => {
      toast.error(i18n.t('failedSaveSettings', { ns: 'toast' }));
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
