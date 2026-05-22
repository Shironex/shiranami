import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import type { DiscordRpcSettings, DiscordMusicPresenceActivity } from '@shiranami/shared';

const C = IPC_CHANNELS.discord;

export interface DiscordApi {
  getSettings: () => Promise<DiscordRpcSettings>;
  updateSettings: (updates: Partial<DiscordRpcSettings>) => Promise<DiscordRpcSettings>;
  updatePresence: (activity: DiscordMusicPresenceActivity) => Promise<void>;
  clearPresence: () => Promise<void>;
}

export const discordApi: DiscordApi = {
  getSettings: () => ipcRenderer.invoke(C.getSettings) as Promise<DiscordRpcSettings>,
  updateSettings: updates =>
    ipcRenderer.invoke(C.updateSettings, updates) as Promise<DiscordRpcSettings>,
  updatePresence: activity => ipcRenderer.invoke(C.updatePresence, activity) as Promise<void>,
  clearPresence: () => ipcRenderer.invoke(C.clearPresence) as Promise<void>,
};
