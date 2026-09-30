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

/** Every settings save shares this key, so a save can tell whether another is still pending. */
export const settingsSaveKey = ['settings', 'save'] as const;

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
    mutationKey: settingsSaveKey,
    // Each save writes the whole blob, so two saves in flight at once could land
    // on disk in either order and the older blob would win. A shared scope runs
    // them one after another, each merging over the cache as it is by then.
    scope: { id: settingsSaveKey.join(':') },
    mutationFn: async (patch: Partial<ElectronSettings>) => {
      if (!IS_ELECTRON) return;
      const current = queryClient.getQueryData<ElectronSettings | null>(settingsKeys.all) ?? {};
      const merged: ElectronSettings = { ...current, ...patch };
      await window.electronAPI.store.set('settings', merged);
      return merged;
    },
    onSuccess: () => {
      // Refetch only after the last pending save. An earlier save's refetch can
      // land before a later save is on disk and overwrite the cache with the
      // older blob. This save still counts itself here, hence `<= 1`.
      if (queryClient.isMutating({ mutationKey: settingsSaveKey }) <= 1) {
        queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      }
    },
    // Fire-and-forget callers (settings toggles, onboarding) have no local
    // catch, so surface the failure here and resync the cache to truth.
    onError: () => {
      toast.error(i18n.t('failedSaveSettings', { ns: 'toast' }));
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
