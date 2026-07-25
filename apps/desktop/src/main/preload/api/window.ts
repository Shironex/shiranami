import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type WindowApi } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.window;

export type { WindowApi };

export const windowApi: WindowApi = {
  minimize: () => invoke(C.minimize),
  maximize: () => invoke(C.maximize),
  close: () => invoke(C.close),
  isMaximized: () => invoke(C.isMaximized),
  setAlwaysOnTop: alwaysOnTop => invoke(C.setAlwaysOnTop, alwaysOnTop),
  setCompactMode: (compactMode, dimensions) => invoke(C.setCompactMode, compactMode, dimensions),
  onMaximizedChange: createIpcListener<boolean>(C.maximizedChange),
};
