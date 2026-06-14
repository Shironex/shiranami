import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import type { DiscordRpcSettings } from '@shiranami/shared';
import {
  getDiscordRpcSettings,
  updateDiscordRpcSettings,
  updateDiscordPresence,
  clearDiscordPresence,
} from '../integrations/discord-rpc';
import type { PlaybackState } from '../integrations/media-controls';
import { handle, handleWithFallback } from './with-ipc-handler';
import {
  discordGetSettingsArgs,
  discordUpdateSettingsArgs,
  discordUpdatePresenceArgs,
  discordClearPresenceArgs,
} from './schemas/discord-rpc';

const C = IPC_CHANNELS.discord;

/**
 * Discord RPC IPC handlers.
 *
 * Normal now-playing updates flow through `media:playback-state` (the media
 * handler calls `updateDiscordPresence` directly), so the renderer does NOT
 * use `update-presence` for routine playback. `update-presence` exists only to
 * force a presence refresh after the settings UI saves, and `clear-presence`
 * for an explicit clear.
 */
export function registerDiscordRpcHandlers(): void {
  handle(
    C.getSettings,
    () => {
      return getDiscordRpcSettings();
    },
    { schema: discordGetSettingsArgs }
  );

  handle(
    C.updateSettings,
    (_event, updates) => {
      // Zod infers `templates` as a Partial<Record<...>> while the canonical
      // `DiscordRpcSettings.templates` is Record<...>. Cast at the boundary —
      // the schema already enforces shape.
      return updateDiscordRpcSettings(updates as Partial<DiscordRpcSettings>);
    },
    { schema: discordUpdateSettingsArgs }
  );

  handleWithFallback(
    C.updatePresence,
    (_event, activity) => {
      // The validated activity carries no album art; the builder doesn't use
      // it, so pad to the PlaybackState shape with a null cover.
      const state: PlaybackState = { ...activity, albumArt: null };
      updateDiscordPresence(state);
    },
    () => undefined,
    { schema: discordUpdatePresenceArgs }
  );

  handleWithFallback(
    C.clearPresence,
    () => {
      clearDiscordPresence();
    },
    () => undefined,
    { schema: discordClearPresenceArgs }
  );
}

export function cleanupDiscordRpcHandlers(): void {
  ipcMain.removeHandler(C.getSettings);
  ipcMain.removeHandler(C.updateSettings);
  ipcMain.removeHandler(C.updatePresence);
  ipcMain.removeHandler(C.clearPresence);
}
