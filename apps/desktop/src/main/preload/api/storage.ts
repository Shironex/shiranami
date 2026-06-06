import { ipcRenderer } from 'electron';
import { IPC_CHANNELS, type DiskUsageResult } from '@shiranami/contracts';

const C = IPC_CHANNELS.storage;

export interface StorageApi {
  /**
   * Compute disk usage for the given watched library-folder paths. Returns one
   * entry per physical volume the folders live on.
   */
  getUsage: (folderPaths: string[]) => Promise<DiskUsageResult>;
}

export const storageApi: StorageApi = {
  getUsage: folderPaths => ipcRenderer.invoke(C.getUsage, folderPaths),
};
