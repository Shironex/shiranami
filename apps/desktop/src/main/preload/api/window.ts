import { invoke } from '../context-bridge';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.window;

export interface WindowApi {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
  setCompactMode: (
    compactMode: boolean,
    dimensions?: { width: number; height: number }
  ) => Promise<void>;
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
}

export const windowApi: WindowApi = {
  minimize: () => invoke(C.minimize),
  maximize: () => invoke(C.maximize),
  close: () => invoke(C.close),
  isMaximized: () => invoke(C.isMaximized),
  setAlwaysOnTop: alwaysOnTop => invoke(C.setAlwaysOnTop, alwaysOnTop),
  setCompactMode: (compactMode, dimensions) => invoke(C.setCompactMode, compactMode, dimensions),
  onMaximizedChange: createIpcListener<boolean>(C.maximizedChange),
};
