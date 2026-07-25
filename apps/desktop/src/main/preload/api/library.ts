import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type LibraryApi, type ScanProgress } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.library;

export type { LibraryApi, ScanProgress };

export const libraryApi: LibraryApi = {
  parseMetadata: filePath => invoke(C.parseMetadata, filePath),
  scanFolder: dirPath => invoke(C.scanFolder, dirPath),
  scanFolderGrouped: dirPath => invoke(C.scanFolderGrouped, dirPath),
  validateFiles: filePaths => invoke(C.validateFiles, filePaths) as Promise<string[]>,
  onScanProgress: createIpcListener<ScanProgress>(C.scanProgress),
  cancelScan: () => invoke(C.scanCancel),
};
