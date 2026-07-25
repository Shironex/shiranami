import { invoke } from '../context-bridge';
import {
  IPC_CHANNELS,
  type DependencyInstallProgress,
  type DownloaderApi,
  type DownloadProgress,
  type DownloadQueueSnapshot,
} from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.downloader;

export type { DownloaderApi };

export const downloaderApi: DownloaderApi = {
  suggest: query => invoke(C.suggest, query),
  search: query => invoke(C.search, query),
  getStreamUrl: url => invoke(C.getStreamUrl, url),
  download: url => invoke(C.download, { url }),
  enqueueDownload: input => invoke(C.enqueue, input),
  cancelDownload: id => invoke(C.cancel, id),
  cancelAllDownloads: () => invoke(C.cancelAll),
  clearCompletedDownloads: () => invoke(C.clearCompleted),
  pauseDownloadQueue: () => invoke(C.pause),
  resumeDownloadQueue: () => invoke(C.resume),
  markDownloadsImported: ids => invoke(C.markImported, ids),
  getDownloadQueue: () => invoke(C.getQueue),
  onQueueState: createIpcListener<DownloadQueueSnapshot>(C.queueState),
  getDownloadLocation: () => invoke(C.getDownloadLocation),
  setDownloadLocation: downloadPath => invoke(C.setDownloadLocation, downloadPath),
  checkDependencies: () => invoke(C.checkDependencies),
  getCachedToolStatus: () => invoke(C.getCachedToolStatus),
  refreshToolStatus: () => invoke(C.refreshToolStatus),
  check: () => invoke(C.check),
  onProgress: createIpcListener<DownloadProgress>(C.progress),
  installYtDlp: () => invoke(C.installYtdlp),
  onInstallProgress: createIpcListener<{ percent: number }>(C.installProgress),
  getYtDlpPath: () => invoke(C.getYtdlpPath),
  checkFfmpeg: () => invoke(C.checkFfmpeg),
  installFfmpeg: () => invoke(C.installFfmpeg),
  onFfmpegInstallProgress: createIpcListener<{ percent: number }>(C.ffmpegInstallProgress),
  installDependencies: () => invoke(C.installDependencies),
  onDependencyInstallProgress: createIpcListener<DependencyInstallProgress>(
    C.dependencyInstallProgress
  ),
};
