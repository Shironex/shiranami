import { invoke } from '../context-bridge';
import {
  IPC_CHANNELS,
  type SearchResult,
  type DownloadQueueSnapshot,
  type EnqueueDownloadInput,
} from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';
import type { InstallDependenciesResult } from '../types';

const C = IPC_CHANNELS.downloader;

interface ToolStatus {
  installed: boolean;
  version?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
}

interface DownloadLocation {
  path: string;
  defaultPath: string;
  isDefault: boolean;
}

interface CachedToolStatus {
  ytdlp: ToolStatus;
  ffmpeg: ToolStatus;
  ytdlpPath: string;
  downloadLocation: DownloadLocation;
  timestamp: number;
}

export interface DownloaderApi {
  getStreamUrl: (url: string) => Promise<string>;
  suggest: (query: string) => Promise<string[]>;
  search: (query: string) => Promise<SearchResult[]>;
  download: (url: string) => Promise<string>;
  enqueueDownload: (input: EnqueueDownloadInput) => Promise<string>;
  cancelDownload: (id: string) => Promise<void>;
  cancelAllDownloads: () => Promise<void>;
  clearCompletedDownloads: () => Promise<void>;
  pauseDownloadQueue: () => Promise<void>;
  resumeDownloadQueue: () => Promise<void>;
  markDownloadsImported: (ids: string[]) => Promise<void>;
  getDownloadQueue: () => Promise<DownloadQueueSnapshot>;
  onQueueState: (cb: (snapshot: DownloadQueueSnapshot) => void) => () => void;
  getDownloadLocation: () => Promise<DownloadLocation>;
  setDownloadLocation: (path: string | null) => Promise<DownloadLocation>;
  checkDependencies: () => Promise<{ ytdlpInstalled: boolean; ffmpegInstalled: boolean }>;
  getCachedToolStatus: () => Promise<CachedToolStatus | null>;
  refreshToolStatus: () => Promise<CachedToolStatus | null>;
  check: () => Promise<ToolStatus>;
  onProgress: (
    callback: (data: {
      url: string;
      progress: number;
      status: 'downloading' | 'converting' | 'done' | 'error';
      error?: string;
    }) => void
  ) => () => void;
  installYtDlp: () => Promise<void>;
  onInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
  getYtDlpPath: () => Promise<string>;
  checkFfmpeg: () => Promise<ToolStatus>;
  installFfmpeg: () => Promise<void>;
  onFfmpegInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
  installDependencies: () => Promise<InstallDependenciesResult>;
  onDependencyInstallProgress: (
    callback: (progress: {
      target: 'ytdlp' | 'ffmpeg';
      percent: number;
      overallPercent: number;
      label: string;
    }) => void
  ) => () => void;
}

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
  onProgress: createIpcListener<{
    url: string;
    progress: number;
    status: 'downloading' | 'converting' | 'done' | 'error';
    error?: string;
  }>(C.progress),
  installYtDlp: () => invoke(C.installYtdlp),
  onInstallProgress: createIpcListener<{ percent: number }>(C.installProgress),
  getYtDlpPath: () => invoke(C.getYtdlpPath),
  checkFfmpeg: () => invoke(C.checkFfmpeg),
  installFfmpeg: () => invoke(C.installFfmpeg),
  onFfmpegInstallProgress: createIpcListener<{ percent: number }>(C.ffmpegInstallProgress),
  installDependencies: () => invoke(C.installDependencies),
  onDependencyInstallProgress: createIpcListener<{
    target: 'ytdlp' | 'ffmpeg';
    percent: number;
    overallPercent: number;
    label: string;
  }>(C.dependencyInstallProgress),
};
