import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type StorageApi } from '@shiranami/contracts';

const C = IPC_CHANNELS.storage;

export type { StorageApi };

export const storageApi: StorageApi = {
  getUsage: folderPaths => invoke(C.getUsage, folderPaths),
};
