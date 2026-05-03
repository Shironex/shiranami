import { ipcRenderer } from 'electron';
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
  minimize: () => ipcRenderer.invoke(C.minimize),
  maximize: () => ipcRenderer.invoke(C.maximize),
  close: () => ipcRenderer.invoke(C.close),
  isMaximized: () => ipcRenderer.invoke(C.isMaximized),
  setAlwaysOnTop: alwaysOnTop => ipcRenderer.invoke(C.setAlwaysOnTop, alwaysOnTop),
  setCompactMode: (compactMode, dimensions) =>
    ipcRenderer.invoke(C.setCompactMode, compactMode, dimensions),
  onMaximizedChange: createIpcListener<boolean>(C.maximizedChange),
};
