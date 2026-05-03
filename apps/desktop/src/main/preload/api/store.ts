import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';

const C = IPC_CHANNELS.store;

export interface StoreApi {
  get: <T>(key: string) => Promise<T | undefined>;
  set: <T>(key: string, value: T) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

export const storeApi: StoreApi = {
  get: <T>(key: string) => ipcRenderer.invoke(C.get, key) as Promise<T | undefined>,
  set: <T>(key: string, value: T) => ipcRenderer.invoke(C.set, key, value),
  delete: key => ipcRenderer.invoke(C.delete, key),
};
