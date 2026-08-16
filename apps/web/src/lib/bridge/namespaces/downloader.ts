import {
  IPC_CHANNELS,
  type DependencyInstallProgress,
  type DownloadProgress,
  type DownloadQueueSnapshot,
  type DownloaderApi,
  type CachedToolStatus,
  type InstallDependenciesResult,
  type SearchResult,
  type ToolStatus,
} from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import {
  dependencyInstallProgress,
  downloadProgress,
  installProgress,
  queueSnapshot,
} from '../narrowers';
import { asContract } from '../wire';

const C = IPC_CHANNELS.downloader;

export const downloaderApi: DownloaderApi = {
  suggest: query => commands.downloaderSuggest(query),
  search: query => asContract<SearchResult[]>(commands.downloaderSearch(query)),
  getStreamUrl: url => commands.downloaderGetStreamUrl(url),
  // v1 wrapped the URL in an object at the preload; the generated binding does
  // its own wrapping, so the shim passes the bare value it was given.
  download: url => commands.downloaderDownload({ url }),
  enqueueDownload: input => commands.downloaderQueueEnqueue(input),
  cancelDownload: async id => {
    await commands.downloaderQueueCancel(id);
  },
  cancelAllDownloads: async () => {
    await commands.downloaderQueueCancelAll();
  },
  retryDownload: async id => {
    await commands.downloaderQueueRetry(id);
  },
  retryAllFailedDownloads: async () => {
    await commands.downloaderQueueRetryAll();
  },
  clearCompletedDownloads: async () => {
    await commands.downloaderQueueClearCompleted();
  },
  pauseDownloadQueue: async () => {
    await commands.downloaderQueuePause();
  },
  resumeDownloadQueue: async () => {
    await commands.downloaderQueueResume();
  },
  markDownloadsImported: async ids => {
    await commands.downloaderQueueMarkImported(ids);
  },
  getDownloadQueue: () => asContract<DownloadQueueSnapshot>(commands.downloaderQueueGet()),
  onQueueState: callback =>
    subscribeChannel<DownloadQueueSnapshot>(
      C.queueState,
      events.downloaderQueueState,
      queueSnapshot,
      callback
    ),
  getDownloadLocation: () => commands.downloaderGetDownloadLocation(),
  // `null` is meaningful here rather than absent: it is how the renderer asks
  // for the default location back.
  setDownloadLocation: downloadPath => commands.downloaderSetDownloadLocation(downloadPath),
  checkDependencies: () => commands.downloaderCheckDependencies(),
  getCachedToolStatus: () =>
    asContract<CachedToolStatus | null>(commands.downloaderGetCachedToolStatus()),
  refreshToolStatus: () =>
    asContract<CachedToolStatus | null>(commands.downloaderRefreshToolStatus()),
  check: () => asContract<ToolStatus>(commands.downloaderCheck()),
  onProgress: callback =>
    subscribeChannel<DownloadProgress>(
      C.progress,
      events.downloaderProgress,
      downloadProgress,
      callback
    ),
  installYtDlp: async () => {
    await commands.downloaderInstallYtdlp();
  },
  onInstallProgress: callback =>
    subscribeChannel<{ percent: number }>(
      C.installProgress,
      events.downloaderInstallProgress,
      installProgress,
      callback
    ),
  getYtDlpPath: () => commands.downloaderGetYtdlpPath(),
  checkFfmpeg: () => asContract<ToolStatus>(commands.downloaderCheckFfmpeg()),
  installFfmpeg: async () => {
    await commands.downloaderInstallFfmpeg();
  },
  onFfmpegInstallProgress: callback =>
    subscribeChannel<{ percent: number }>(
      C.ffmpegInstallProgress,
      events.downloaderFfmpegInstallProgress,
      installProgress,
      callback
    ),
  installDependencies: () =>
    asContract<InstallDependenciesResult>(commands.downloaderInstallDependencies()),
  onDependencyInstallProgress: callback =>
    subscribeChannel<DependencyInstallProgress>(
      C.dependencyInstallProgress,
      events.downloaderDependencyInstallProgress,
      dependencyInstallProgress,
      callback
    ),
};
