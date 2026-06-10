import { invoke } from '../context-bridge';
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
  getSettings: () => invoke(C.getSettings) as Promise<DiscordRpcSettings>,
  updateSettings: updates => invoke(C.updateSettings, updates) as Promise<DiscordRpcSettings>,
  updatePresence: activity => invoke(C.updatePresence, activity) as Promise<void>,
  clearPresence: () => invoke(C.clearPresence) as Promise<void>,
};
