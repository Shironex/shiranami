import { invoke } from '../context-bridge';
import {
  IPC_CHANNELS,
  type UpdateDownloadProgress,
  type UpdateInfo,
  type UpdaterApi,
} from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.updater;

export type { UpdaterApi };

export const updaterApi: UpdaterApi = {
  checkForUpdates: () => invoke(C.checkForUpdates),
  startDownload: () => invoke(C.startDownload),
  installNow: () => invoke(C.installNow),
  onCheckingForUpdate: createIpcListener<void>(C.checkingForUpdate),
  onUpdateAvailable: createIpcListener<UpdateInfo>(C.updateAvailable),
  onUpdateNotAvailable: createIpcListener<void>(C.updateNotAvailable),
  onDownloadProgress: createIpcListener<UpdateDownloadProgress>(C.downloadProgress),
  onUpdateDownloaded: createIpcListener<UpdateInfo>(C.updateDownloaded),
  onUpdateError: createIpcListener<string>(C.error),
};
