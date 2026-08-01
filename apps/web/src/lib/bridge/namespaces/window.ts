import { IPC_CHANNELS, type WindowApi } from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { maximizedChange } from '../narrowers';

const C = IPC_CHANNELS.window;

export const windowApi: WindowApi = {
  minimize: async () => {
    await commands.windowMinimize();
  },
  maximize: async () => {
    await commands.windowMaximize();
  },
  close: async () => {
    await commands.windowClose();
  },
  isMaximized: () => commands.windowIsMaximized(),
  setAlwaysOnTop: alwaysOnTop => commands.windowSetAlwaysOnTop(alwaysOnTop),
  // v1's second argument is optional; the generated one is nullable, and the
  // two are not the same thing over the wire — an omitted key would reach serde
  // as a missing field rather than as "no dimensions".
  setCompactMode: async (compactMode, dimensions) => {
    await commands.windowSetCompactMode(compactMode, dimensions ?? null);
  },
  onMaximizedChange: callback =>
    subscribeChannel(C.maximizedChange, events.windowMaximizedChange, maximizedChange, callback),
};
