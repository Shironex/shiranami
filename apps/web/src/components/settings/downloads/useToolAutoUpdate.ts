import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SystemNotice, ToolAutoUpdateState } from '@shiranami/contracts';
import { useSettingsQuery, useUpdateSettingsMutation } from '@/hooks/queries/useSettings';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';

/**
 * The automatic tool-update opt-in, kept as a field inside the renderer
 * `settings` blob for the same reason as `saveFetchedLyrics` (see
 * `useLyricsSavePrefs`): a dedicated store key would have to join the frozen
 * v1 key allowlist. The Rust scheduler reads the same field out of the same
 * blob (`downloads::auto_update::AUTO_UPDATE_TOOLS_FIELD`), so the name is
 * spelled once on each side and nowhere else.
 */
export const AUTO_UPDATE_TOOLS_FIELD = 'autoUpdateTools';

export const toolAutoUpdateKeys = {
  status: ['downloader', 'autoUpdateStatus'] as const,
};

/**
 * How often the record is re-read while automatic updates are on, so the card
 * notices an install starting or finishing without a click. A settings read
 * plus two lock checks, so cheap.
 */
const STATUS_POLL_MS = 10_000;

/** Notice codes the scheduler raises when it installed a new version. */
const UPDATED_CODES = new Set(['ytdlpAutoUpdated', 'ffmpegAutoUpdated']);

/**
 * The opt-in, the persisted record of what automatic updating did, and a
 * setter. Calls `onToolUpdated` when the scheduler installs a new version
 * while the card is open, so the version rows refresh without a click.
 */
export function useToolAutoUpdate(onToolUpdated?: () => void) {
  const queryClient = useQueryClient();
  const settings = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();
  const getStatus = IS_ELECTRON ? window.electronAPI.downloader.getToolAutoUpdateStatus : undefined;

  const optedIn = settings.data?.[AUTO_UPDATE_TOOLS_FIELD] === true;

  const status = useQuery({
    queryKey: toolAutoUpdateKeys.status,
    queryFn: async (): Promise<ToolAutoUpdateState | null> => (getStatus ? getStatus() : null),
    enabled: Boolean(getStatus),
    refetchInterval: optedIn ? STATUS_POLL_MS : false,
  });

  useEffect(() => {
    if (!IS_ELECTRON) return;
    return window.electronAPI.system.onNotice((notice: SystemNotice) => {
      if (notice.source !== 'downloader' || !UPDATED_CODES.has(notice.code)) return;
      void queryClient.invalidateQueries({ queryKey: toolAutoUpdateKeys.status });
      onToolUpdated?.();
    });
  }, [queryClient, onToolUpdated]);

  // `=== true`: an absent field is a user who never opted in, and this feature
  // replaces executables unattended. The Rust side reads it the same way.
  const enabled =
    settings.data === undefined ? undefined : settings.data?.[AUTO_UPDATE_TOOLS_FIELD] === true;

  return {
    enabled: enabled === true,
    // Disabled until the backend has answered, and wherever the runtime keeps
    // no record (the legacy Electron shell), so the switch never promises
    // something nothing will do.
    disabled: !getStatus || enabled === undefined,
    record: status.data ?? null,
    // evermeet.cx publishes no checksum, so the backend never updates ffmpeg
    // unattended on macOS (`update::policy::auto_updatable`).
    ffmpegIncluded: !IS_MAC,
    ytdlpInstalling: status.data?.ytdlp?.installing === true,
    ffmpegInstalling: status.data?.ffmpeg?.installing === true,
    setEnabled: (value: boolean) => {
      updateSettings.mutate(
        { [AUTO_UPDATE_TOOLS_FIELD]: value },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: toolAutoUpdateKeys.status });
          },
        }
      );
    },
  };
}
