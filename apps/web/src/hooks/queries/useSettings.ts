import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';

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
  });
}
