import { invoke } from '../context-bridge';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';
import type { TrackMetadata } from '../types';

const C = IPC_CHANNELS.library;

export interface ScanProgress {
  filePath: string;
  fileIndex: number;
  fileCount: number;
  ok: boolean;
}

export interface LibraryApi {
  parseMetadata: (filePath: string) => Promise<{ filePath: string; metadata: TrackMetadata }>;
  scanFolder: (dirPath: string) => Promise<Array<{ filePath: string; metadata: TrackMetadata }>>;
  scanFolderGrouped: (dirPath: string) => Promise<{
    rootTracks: Array<{ filePath: string; metadata: TrackMetadata }>;
    subfolders: Array<{
      name: string;
      path: string;
      tracks: Array<{ filePath: string; metadata: TrackMetadata }>;
    }>;
  }>;
  validateFiles: (filePaths: string[]) => Promise<string[]>;
  onScanProgress: (callback: (data: ScanProgress) => void) => () => void;
  cancelScan: () => Promise<void>;
}

export const libraryApi: LibraryApi = {
  parseMetadata: filePath => invoke(C.parseMetadata, filePath),
  scanFolder: dirPath => invoke(C.scanFolder, dirPath),
  scanFolderGrouped: dirPath => invoke(C.scanFolderGrouped, dirPath),
  validateFiles: filePaths => invoke(C.validateFiles, filePaths) as Promise<string[]>,
  onScanProgress: createIpcListener<ScanProgress>(C.scanProgress),
  cancelScan: () => invoke(C.scanCancel),
};
