import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import type { TrackMetadata } from '../types';

const C = IPC_CHANNELS.library;

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
}

export const libraryApi: LibraryApi = {
  parseMetadata: filePath => ipcRenderer.invoke(C.parseMetadata, filePath),
  scanFolder: dirPath => ipcRenderer.invoke(C.scanFolder, dirPath),
  scanFolderGrouped: dirPath => ipcRenderer.invoke(C.scanFolderGrouped, dirPath),
  validateFiles: filePaths => ipcRenderer.invoke(C.validateFiles, filePaths) as Promise<string[]>,
};
