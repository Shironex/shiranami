import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.updater;

interface UpdateInfo {
  version: string;
  releaseNotes: string | null;
  releaseDate: string;
}

interface DownloadProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface UpdaterApi {
  checkForUpdates: () => Promise<{ enabled: boolean }>;
  startDownload: () => Promise<void>;
  installNow: () => Promise<void>;
  onCheckingForUpdate: (callback: () => void) => () => void;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateNotAvailable: (callback: () => void) => () => void;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateError: (callback: (message: string) => void) => () => void;
}

export const updaterApi: UpdaterApi = {
  checkForUpdates: () => ipcRenderer.invoke(C.checkForUpdates),
  startDownload: () => ipcRenderer.invoke(C.startDownload),
  installNow: () => ipcRenderer.invoke(C.installNow),
  onCheckingForUpdate: createIpcListener<void>(C.checkingForUpdate),
  onUpdateAvailable: createIpcListener<UpdateInfo>(C.updateAvailable),
  onUpdateNotAvailable: createIpcListener<void>(C.updateNotAvailable),
  onDownloadProgress: createIpcListener<DownloadProgress>(C.downloadProgress),
  onUpdateDownloaded: createIpcListener<UpdateInfo>(C.updateDownloaded),
  onUpdateError: createIpcListener<string>(C.error),
};
