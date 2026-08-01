import type { ElectronAPI } from '@/types/electron';
import { commands } from '../commands';

export const discordApi: ElectronAPI['discord'] = {
  getSettings: () => commands.discordRpcGetSettings(),
  updateSettings: updates => commands.discordRpcUpdateSettings(updates),
  updatePresence: async activity => {
    await commands.discordRpcUpdatePresence(activity);
  },
  clearPresence: async () => {
    await commands.discordRpcClearPresence();
  },
};
