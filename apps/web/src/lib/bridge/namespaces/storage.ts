import type { DiskUsageResult, StorageApi } from '@shiranami/contracts';
import { commands } from '../commands';
import { asContract } from '../wire';

export const storageApi: StorageApi = {
  getUsage: folderPaths => asContract<DiskUsageResult>(commands.storageGetUsage(folderPaths)),
};
