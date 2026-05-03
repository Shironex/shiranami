import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
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

interface SearchResult {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
  webpage_url: string;
}

export interface DownloaderApi {
  getStreamUrl: (url: string) => Promise<string>;
  suggest: (query: string) => Promise<string[]>;
  search: (query: string) => Promise<SearchResult[]>;
  download: (url: string) => Promise<string>;
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
  suggest: query => ipcRenderer.invoke(C.suggest, query),
  search: query => ipcRenderer.invoke(C.search, query),
  getStreamUrl: url => ipcRenderer.invoke(C.getStreamUrl, url),
  download: url => ipcRenderer.invoke(C.download, { url }),
  getDownloadLocation: () => ipcRenderer.invoke(C.getDownloadLocation),
  setDownloadLocation: downloadPath => ipcRenderer.invoke(C.setDownloadLocation, downloadPath),
  checkDependencies: () => ipcRenderer.invoke(C.checkDependencies),
  getCachedToolStatus: () => ipcRenderer.invoke(C.getCachedToolStatus),
  refreshToolStatus: () => ipcRenderer.invoke(C.refreshToolStatus),
  check: () => ipcRenderer.invoke(C.check),
  onProgress: createIpcListener<{
    url: string;
    progress: number;
    status: 'downloading' | 'converting' | 'done' | 'error';
    error?: string;
  }>(C.progress),
  installYtDlp: () => ipcRenderer.invoke(C.installYtdlp),
  onInstallProgress: createIpcListener<{ percent: number }>(C.installProgress),
  getYtDlpPath: () => ipcRenderer.invoke(C.getYtdlpPath),
  checkFfmpeg: () => ipcRenderer.invoke(C.checkFfmpeg),
  installFfmpeg: () => ipcRenderer.invoke(C.installFfmpeg),
  onFfmpegInstallProgress: createIpcListener<{ percent: number }>(C.ffmpegInstallProgress),
  installDependencies: () => ipcRenderer.invoke(C.installDependencies),
  onDependencyInstallProgress: createIpcListener<{
    target: 'ytdlp' | 'ffmpeg';
    percent: number;
    overallPercent: number;
    label: string;
  }>(C.dependencyInstallProgress),
};
