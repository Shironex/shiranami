import {
  IPC_CHANNELS,
  type UpdateDownloadProgress,
  type UpdateInfo,
  type UpdaterApi,
} from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { bareString, noPayload, updateDownloadProgress, updateInfo } from '../narrowers';

const C = IPC_CHANNELS.updater;

export const updaterApi: UpdaterApi = {
  checkForUpdates: () => commands.updaterCheckForUpdates(),
  startDownload: async () => {
    await commands.updaterStartDownload();
  },
  installNow: async () => {
    await commands.updaterInstallNow();
  },
  // The two payload-less channels: v1's `webContents.send(channel)` delivered
  // `undefined`, the Rust newtype over `()` delivers `null`, and the renderer's
  // callbacks take no argument either way.
  onCheckingForUpdate: callback =>
    subscribeChannel<void>(C.checkingForUpdate, events.updaterCheckingForUpdate, noPayload, () =>
      callback()
    ),
  onUpdateAvailable: callback =>
    subscribeChannel<UpdateInfo>(
      C.updateAvailable,
      events.updaterUpdateAvailable,
      updateInfo,
      callback
    ),
  onUpdateNotAvailable: callback =>
    subscribeChannel<void>(C.updateNotAvailable, events.updaterUpdateNotAvailable, noPayload, () =>
      callback()
    ),
  onDownloadProgress: callback =>
    subscribeChannel<UpdateDownloadProgress>(
      C.downloadProgress,
      events.updaterDownloadProgress,
      updateDownloadProgress,
      callback
    ),
  onUpdateDownloaded: callback =>
    subscribeChannel<UpdateInfo>(
      C.updateDownloaded,
      events.updaterUpdateDownloaded,
      updateInfo,
      callback
    ),
  onUpdateError: callback =>
    subscribeChannel<string>(C.error, events.updaterError, bareString, callback),
};
