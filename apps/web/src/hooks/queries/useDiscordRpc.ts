import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DiscordRpcSettings } from '@shiranami/shared';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';

/**
 * React Query access to the dedicated Discord RPC settings (electron-store key
 * `discord-rpc-settings`, owned by the main-process service). This replaces the
 * old `settings.discordRpc` boolean for the onboarding flow and summary; the
 * full Settings section manages its own local draft state on top of the same
 * IPC and invalidates this query on save.
 */
export const discordRpcKeys = {
  all: ['discord-rpc-settings'] as const,
};

export function useDiscordRpcSettingsQuery() {
  return useQuery({
    queryKey: discordRpcKeys.all,
    queryFn: async () => {
      if (!IS_ELECTRON) return null;
      return window.electronAPI.discord.getSettings();
    },
    enabled: IS_ELECTRON,
    staleTime: Infinity,
  });
}

export function useUpdateDiscordRpcSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<DiscordRpcSettings>) => {
      if (!IS_ELECTRON) return null;
      return window.electronAPI.discord.updateSettings(updates);
    },
    onSuccess: next => {
      if (next) queryClient.setQueryData(discordRpcKeys.all, next);
    },
    // Covers both the DiscordSection save and the fire-and-forget onboarding
    // toggle, which otherwise fail silently.
    onError: () => {
      toast.error(i18n.t('failedSaveSettings', { ns: 'toast' }));
    },
  });
}
