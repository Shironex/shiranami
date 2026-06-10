// Domain types for installing the external tools the downloader depends on
// (yt-dlp, ffmpeg). The main process performs the installs and reports the
// outcome across the contextBridge; the preload and renderer describe the same
// shape, so it lives here rather than in either layer.

/** Result of installing one external tool. */
export interface ToolInstallResult {
  tool: 'ytdlp' | 'ffmpeg';
  success: boolean;
  error?: string;
}

/** Aggregate result of an install-dependencies run (one entry per tool). */
export interface InstallDependenciesResult {
  results: ToolInstallResult[];
}
