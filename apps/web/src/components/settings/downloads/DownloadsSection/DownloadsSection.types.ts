export interface IDownloadsSectionView {
  // --- Top-level loading / install-one-pass state ---
  /** Whether tool status is still being checked (shows the skeleton). */
  readonly isCheckingDownloadTools: boolean;
  /** Whether any required tool is missing (shows the one-pass install card). */
  readonly hasMissingDownloadTools: boolean;
  /** Whether the one-pass install card renders (checked AND tools missing). */
  readonly showInstallOnePassCard: boolean;
  /** Whether the one-pass dependency install is currently running. */
  readonly dependenciesInstalling: boolean;
  /** One-pass dependency install progress (0–100). */
  readonly dependencyInstallProgress: number;
  /** Pre-composed one-pass install caption (e.g. "Installing yt-dlp... 40%"). */
  readonly dependencyInstallCaption: string;
  /** Whether the manual refresh button is disabled. */
  readonly refreshDisabled: boolean;
  /** Whether the refresh icon should spin. */
  readonly isRefreshing: boolean;

  // --- yt-dlp ---
  /** Whether yt-dlp is installed. */
  readonly ytdlpInstalled: boolean;
  /** Whether a yt-dlp update is available. */
  readonly ytdlpUpdateAvailable: boolean;
  /** Resolved yt-dlp binary path (empty when unknown). */
  readonly ytdlpPath: string;
  /** Whether a yt-dlp install/update is in flight. */
  readonly ytdlpInstalling: boolean;
  /** yt-dlp install progress (0–100). */
  readonly ytdlpInstallProgress: number;
  /** Pre-composed yt-dlp download caption. */
  readonly ytdlpInstallCaption: string;
  /** Formatted yt-dlp installed-version text. */
  readonly ytdlpInstalledVersionText: string;
  /** Formatted yt-dlp latest-version text, or null when unknown. */
  readonly ytdlpLatestText: string | null;
  /** Hint shown beneath the yt-dlp controls (latest vs install hint). */
  readonly ytdlpHint: string;

  // --- ffmpeg ---
  /** Whether ffmpeg is installed. */
  readonly ffmpegInstalled: boolean;
  /** Whether an ffmpeg update is available. */
  readonly ffmpegUpdateAvailable: boolean;
  /** Whether an ffmpeg install/update is in flight. */
  readonly ffmpegInstalling: boolean;
  /** ffmpeg install progress (0–100). */
  readonly ffmpegInstallProgress: number;
  /** Pre-composed ffmpeg download caption. */
  readonly ffmpegInstallCaption: string;
  /** Formatted ffmpeg installed-version text. */
  readonly ffmpegInstalledVersionText: string;
  /** Formatted ffmpeg latest-version text, or null when unknown. */
  readonly ffmpegLatestText: string | null;
  /** Hint shown beneath the ffmpeg controls (latest vs install hint). */
  readonly ffmpegHint: string;

  // --- Download location ---
  /** Path displayed in the location panel (custom, default, or "checking"). */
  readonly locationPathDisplay: string;
  /** Whether the current location is the default. */
  readonly downloadLocationIsDefault: boolean;
  /** Whether a location change/reset is in flight. */
  readonly downloadLocationUpdating: boolean;

  // --- Static labels (settings namespace) ---
  /** "Install all" one-pass card title. */
  readonly installOnePassTitle: string;
  /** One-pass card subtitle. */
  readonly installOnePassDesc: string;
  /** "Install missing" button label. */
  readonly installMissingLabel: string;
  /** Main downloads card title. */
  readonly title: string;
  /** Main downloads card subtitle. */
  readonly subtitle: string;
  /** Refresh button title/aria-label. */
  readonly refreshTitle: string;
  /** Binary-path field label. */
  readonly binaryPathLabel: string;
  /** "Update yt-dlp" button label. */
  readonly updateYtdlpLabel: string;
  /** "Update ffmpeg" button label. */
  readonly updateFfmpegLabel: string;
  /** Localized yt-dlp installed/not-installed status titles. */
  readonly ytdlpStatusInstalledTitle: string;
  readonly ytdlpStatusNotInstalledTitle: string;
  /** Localized ffmpeg installed/not-installed status titles. */
  readonly ffmpegStatusInstalledTitle: string;
  readonly ffmpegStatusNotInstalledTitle: string;
  /** "Recommended" trailing label for the ffmpeg status row. */
  readonly ffmpegRecommendedLabel: string;
  /** Note shown when ffmpeg is not installed. */
  readonly ffmpegRecommendedNote: string;

  // --- Handlers ---
  /** Run the one-pass install of all missing tools. */
  readonly onInstallMissingTools: () => void;
  /** Manually refresh tool status. */
  readonly onRefresh: () => void;
  /** Install/update yt-dlp. */
  readonly onInstallYtDlp: () => void;
  /** Install/update ffmpeg. */
  readonly onInstallFfmpeg: () => void;
  /** Open the directory picker to change the download location. */
  readonly onChangeDownloadLocation: () => void;
  /** Reset the download location to the default. */
  readonly onResetDownloadLocation: () => void;
}
