/**
 * The `window.electronAPI` surface, one interface per namespace.
 *
 * This is the single definition of the contextBridge API. The preload modules
 * (`apps/desktop/src/main/preload/api/*.ts`) annotate their exported objects
 * with these interfaces, and the renderer's ambient declaration
 * (`apps/web/src/types/electron.d.ts`) composes them. Both sides previously
 * restated every signature by hand and the two mirrors drifted; defining them
 * here means a method can only change in one place.
 *
 * Three namespaces are deliberately absent because they reference types this
 * package cannot see without taking a workspace (or Electron) dependency:
 * `dialog` (Electron's `OpenDialogOptions`), `store` (the desktop `StoreSchema`)
 * and `discord` (`@shiranami/shared`). Those stay declared on each side, and the
 * preload↔renderer contract assertion in
 * `apps/desktop/src/main/preload/electron-api-contract.test.ts` keeps them honest.
 */

import type { WatchedFolder } from '../domain/folder';
import type { LyricsResult } from '../domain/lyrics';
import type { PlaylistExtractResult, SearchResult, TrackMetadata } from '../domain/media';
import type { InstallDependenciesResult } from '../domain/dependencies';
import type { DownloadQueueSnapshot, EnqueueDownloadInput } from '../domain/download-queue';
import type {
  Playlist,
  PlaylistCreateInput,
  PlaylistCreateWithTracksInput,
  PlaylistUpdateInput,
} from '../domain/playlist';
import type { RadioFavorite, RadioStationInput } from '../domain/radio';
import type {
  RecommendationShelves,
  SimilarTrackResult,
  SmartMixResult,
  SmartMixSignals,
} from '../domain/recommendation';
import type {
  LastfmConnectResult,
  ListenBrainzConnectResult,
  ScrobbleStatus,
} from '../domain/scrobble';
import type {
  SmartPlaylist,
  SmartPlaylistDefinition,
  SmartPlaylistMatchType,
  SmartPlaylistRule,
} from '../domain/smart-playlist';
import type { Track, TrackCreateInput, TrackUpdateInput } from '../domain/track';
import type { GeocodeResult, WeatherCurrent } from '../domain/weather';
import type { ShareImportResponse } from '../share/dto';
import type { DbExportResult, DbImportResult } from './database';
import type { MainMetricsSnapshot } from './debug';
import type {
  PLAYLIST_ERROR_CODES,
  SHARE_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from './error-codes';
import type {
  ListeningActivityPoint,
  ListeningHistoryEntry,
  ListeningHourlyActivityPoint,
  ListeningStatsSummary,
  PlayHistoryRecord,
  RecordPlayInput,
  WeeklyInsights,
} from './history';
import type { AnalysisBatchResult, AnalysisInput, AnalysisProgress } from './analysis';
import type { CompanionSpecies, CompanionState, CompanionXpGain } from './companion';
import type { DoctorProgress, DoctorScanInput, DoctorScanResult } from './doctor';
import type { LoudnessAnalyzeInput, LoudnessAnalyzeResult, LoudnessProgress } from './loudness';
import type {
  EnrichProgress,
  EnrichTrackInput,
  EnrichTrackResult,
  MetadataLookupResult,
  WriteTagsInput,
  WriteTagsResult,
} from './metadata';
import type { DiskUsageResult } from './storage';
import type { SystemNotice } from './system';
import type { WaveformPeaksResult } from './waveform';

// ── app ───────────────────────────────────────────────────────────────────

export interface AppApi {
  getVersion: () => Promise<string>;
  openLogsFolder: () => Promise<void>;
  getLocaleCountry: () => Promise<string>;
}

// ── window ────────────────────────────────────────────────────────────────

export interface WindowApi {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
  setCompactMode: (
    compactMode: boolean,
    dimensions?: { width: number; height: number }
  ) => Promise<void>;
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
}

// ── library ───────────────────────────────────────────────────────────────

/** Per-file progress event streamed during a folder scan. */
export interface ScanProgress {
  filePath: string;
  fileIndex: number;
  fileCount: number;
  ok: boolean;
}

/** One parsed audio file: its path plus the tags read off it. */
export interface ScannedFile {
  filePath: string;
  metadata: TrackMetadata;
}

/** A scanned folder's own tracks plus one entry per immediate subfolder. */
export interface GroupedScanResult {
  rootTracks: ScannedFile[];
  subfolders: Array<{
    name: string;
    path: string;
    tracks: ScannedFile[];
  }>;
}

export interface LibraryApi {
  parseMetadata: (filePath: string) => Promise<ScannedFile>;
  scanFolder: (dirPath: string) => Promise<ScannedFile[]>;
  scanFolderGrouped: (dirPath: string) => Promise<GroupedScanResult>;
  validateFiles: (filePaths: string[]) => Promise<string[]>;
  onScanProgress: (callback: (data: ScanProgress) => void) => () => void;
  cancelScan: () => Promise<void>;
}

// ── analysis ──────────────────────────────────────────────────────────────

export interface AnalysisApi {
  /**
   * Decode each submitted file once and persist every measurement the engine
   * makes — waveform peaks, loudness, and tempo/key — on the track row.
   * Tracks already carrying everything, and missing files, are skipped.
   */
  analyze: (tracks: AnalysisInput[]) => Promise<AnalysisBatchResult>;
  cancel: () => Promise<void>;
  onProgress: (callback: (data: AnalysisProgress) => void) => () => void;
}

// ── doctor ────────────────────────────────────────────────────────────────

export interface DoctorApi {
  /**
   * Decode every submitted file once and report decode-truth findings —
   * truncation, damaged packets, duration lies, clipping, silence. Findings
   * are informative; nothing is fixed, deleted or written.
   */
  scan: (tracks: DoctorScanInput[]) => Promise<DoctorScanResult>;
  cancel: () => Promise<void>;
  onProgress: (callback: (data: DoctorProgress) => void) => () => void;
}

// ── companion ─────────────────────────────────────────────────────────────

export interface CompanionApi {
  /**
   * The companion's persistent self. The first call ever hatches the
   * singleton, seeding its XP from the whole play history; `lastSeenAt` in
   * the returned state is the *previous* sighting (the call stamps the new
   * one after reading), so return-after-absence moods cost one round trip.
   */
  getState: () => Promise<CompanionState>;
  /** The naming ceremony. Returns the updated state. */
  setName: (name: string) => Promise<CompanionState>;
  /**
   * Switch who lives with you. Stage, XP, name and accessories all survive
   * the switch — a preference, not a collection.
   */
  setSpecies: (species: CompanionSpecies) => Promise<CompanionState>;
  /** XP accrued from a recorded play, streamed by `db:history:record-play`. */
  onXp: (callback: (gain: CompanionXpGain) => void) => () => void;
}

// ── loudness ──────────────────────────────────────────────────────────────

export interface LoudnessApi {
  /**
   * Measure integrated loudness (LUFS) for the given tracks via ffmpeg
   * loudnorm and persist it on each track row. Tracks already analysed, with
   * non-finite loudness, or with a missing file are skipped.
   */
  analyze: (tracks: LoudnessAnalyzeInput[]) => Promise<LoudnessAnalyzeResult>;
  cancel: () => Promise<void>;
  onProgress: (callback: (data: LoudnessProgress) => void) => () => void;
}

// ── waveform ──────────────────────────────────────────────────────────────

export interface WaveformApi {
  /**
   * Fetch (and cache) waveform peaks for a local audio file. Resolves null for
   * radio streams, missing files, or formats the native decoder can't read —
   * the seekbar falls back to a flat bar in those cases.
   */
  getPeaks: (filePath: string) => Promise<WaveformPeaksResult | null>;
}

// ── media ─────────────────────────────────────────────────────────────────

/** Snapshot the renderer pushes to the OS media session / now-playing UI. */
export interface MediaPlaybackState {
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  duration: number;
  currentTime: number;
  albumArt: string | null;
}

export interface MediaApi {
  onCommand: (callback: (command: string) => void) => () => void;
  sendPlaybackState: (state: MediaPlaybackState) => Promise<void>;
  clearState: () => Promise<void>;
}

// ── lyrics ────────────────────────────────────────────────────────────────

export interface LyricsApi {
  fetch: (
    title: string,
    artist: string,
    album?: string,
    duration?: number,
    filePath?: string
  ) => Promise<LyricsResult>;
}

// ── weather ───────────────────────────────────────────────────────────────

export interface WeatherApi {
  geocode: (query: string) => Promise<GeocodeResult | null>;
  getCurrent: (coords: { lat: number; lon: number }) => Promise<WeatherCurrent>;
}

// ── db ────────────────────────────────────────────────────────────────────

export interface DbTracksApi {
  getAll: () => Promise<Track[]>;
  /** Idempotent on `filePath`: an already-imported file returns its existing row. */
  add: (track: TrackCreateInput) => Promise<Track | undefined>;
  /** Returns only the rows actually inserted — duplicates are skipped, not echoed. */
  addMany: (tracks: TrackCreateInput[]) => Promise<Track[]>;
  remove: (id: string) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  update: (id: string, data: TrackUpdateInput) => Promise<Track | undefined>;
  updateMany: (updates: Array<{ id: string; data: TrackUpdateInput }>) => Promise<void>;
  toggleFavorite: (id: string) => Promise<Track | undefined>;
  getFavorites: () => Promise<Track[]>;
  incrementPlayCount: (id: string) => Promise<Track | undefined>;
  exists: (filePath: string) => Promise<boolean>;
  existsMany: (filePaths: string[]) => Promise<string[]>;
  getIdByPath: (filePath: string) => Promise<string | null>;
  /**
   * Ranked FTS5 search, best match first; an empty query returns no rows.
   * v2-only (F6), hence optional: the v1 preload also implements this
   * interface and has no FTS index — the renderer feature-detects and keeps
   * its client-side filter where this is absent.
   */
  search?: (query: string, limit?: number) => Promise<Track[]>;
}

export interface DbHistoryApi {
  recordPlay: (data: RecordPlayInput) => Promise<PlayHistoryRecord>;
  getRecent: (options?: {
    limit?: number;
    since?: string | null;
  }) => Promise<ListeningHistoryEntry[]>;
  getSummary: (options?: {
    since?: string | null;
    until?: string | null;
  }) => Promise<ListeningStatsSummary>;
  /** `until` is exclusive on all three activity reads, mirroring `getSummary` —
   *  optional, so every v1 `{ since }`-only call shape keeps working. */
  getActivity: (options?: {
    since?: string | null;
    until?: string | null;
  }) => Promise<ListeningActivityPoint[]>;
  getHourlyActivity: (options?: {
    since?: string | null;
    until?: string | null;
  }) => Promise<ListeningHourlyActivityPoint[]>;
  getWeeklyInsights: (options?: {
    since?: string | null;
    until?: string | null;
  }) => Promise<WeeklyInsights>;
}

export interface DbFoldersApi {
  getAll: () => Promise<WatchedFolder[]>;
  add: (path: string) => Promise<WatchedFolder | undefined>;
  remove: (id: string) => Promise<void>;
  updateScanned: (id: string) => Promise<WatchedFolder | undefined>;
}

export interface DbPlaylistsApi {
  getAll: () => Promise<Playlist[]>;
  get: (id: string) => Promise<Playlist | undefined>;
  create: (data: PlaylistCreateInput) => Promise<Playlist | undefined>;
  createWithTracks: (data: PlaylistCreateWithTracksInput) => Promise<Playlist | undefined>;
  update: (id: string, data: PlaylistUpdateInput) => Promise<Playlist | undefined>;
  delete: (id: string) => Promise<void>;
  getTracks: (playlistId: string) => Promise<Track[]>;
  /**
   * Idempotent per the UNIQUE(playlist_id, track_id) constraint. Resolves to the
   * membership row's id — the pre-existing one when the track was already in the
   * playlist, otherwise the freshly inserted one.
   */
  addTrack: (playlistId: string, trackId: string) => Promise<{ id: string }>;
  addTracks: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeTrack: (playlistId: string, trackId: string) => Promise<void>;
  removeTracks: (playlistId: string, trackIds: string[]) => Promise<void>;
  getPlaylistsForTracks: (trackIds: string[]) => Promise<string[]>;
  reorder: (playlistId: string, trackIds: string[]) => Promise<void>;
}

export interface DbSmartPlaylistsApi {
  getAll: () => Promise<SmartPlaylist[]>;
  get: (id: string) => Promise<SmartPlaylist | null>;
  create: (data: {
    name: string;
    description?: string;
    matchType: SmartPlaylistMatchType;
    rules: SmartPlaylistRule[];
  }) => Promise<SmartPlaylist>;
  update: (
    id: string,
    data: {
      name?: string;
      description?: string;
      matchType?: SmartPlaylistMatchType;
      rules?: SmartPlaylistRule[];
    }
  ) => Promise<SmartPlaylist | null>;
  delete: (id: string) => Promise<void>;
  /** Evaluate a saved smart playlist and return matching track rows. */
  getTracks: (id: string) => Promise<Track[]>;
  /** Evaluate an unsaved rule definition (live editor preview). */
  preview: (definition: SmartPlaylistDefinition) => Promise<Track[]>;
}

export interface DbBackupApi {
  export: () => Promise<DbExportResult>;
  import: () => Promise<DbImportResult>;
}

export interface DbApi {
  tracks: DbTracksApi;
  history: DbHistoryApi;
  folders: DbFoldersApi;
  playlists: DbPlaylistsApi;
  smartPlaylists: DbSmartPlaylistsApi;
  backup: DbBackupApi;
}

// ── downloader ────────────────────────────────────────────────────────────

/** Installed-state of one external tool (yt-dlp / ffmpeg). */
export interface ToolStatus {
  installed: boolean;
  version?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
}

/** Where finished downloads land, plus whether that is still the default. */
export interface DownloadLocation {
  path: string;
  defaultPath: string;
  isDefault: boolean;
}

/** Cached snapshot of both tools' status, reused across renderer reloads. */
export interface CachedToolStatus {
  ytdlp: ToolStatus;
  ffmpeg: ToolStatus;
  ytdlpPath: string;
  downloadLocation: DownloadLocation;
  timestamp: number;
}

/** Progress event for the legacy single-URL download path. */
export interface DownloadProgress {
  url: string;
  progress: number;
  status: 'downloading' | 'converting' | 'done' | 'error';
  error?: string;
}

/** Progress event for a combined yt-dlp + ffmpeg install run. */
export interface DependencyInstallProgress {
  target: 'ytdlp' | 'ffmpeg';
  percent: number;
  overallPercent: number;
  label: string;
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
  onQueueState: (callback: (snapshot: DownloadQueueSnapshot) => void) => () => void;
  getDownloadLocation: () => Promise<DownloadLocation>;
  setDownloadLocation: (path: string | null) => Promise<DownloadLocation>;
  checkDependencies: () => Promise<{ ytdlpInstalled: boolean; ffmpegInstalled: boolean }>;
  getCachedToolStatus: () => Promise<CachedToolStatus | null>;
  refreshToolStatus: () => Promise<CachedToolStatus | null>;
  check: () => Promise<ToolStatus>;
  onProgress: (callback: (data: DownloadProgress) => void) => () => void;
  installYtDlp: () => Promise<void>;
  onInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
  getYtDlpPath: () => Promise<string>;
  checkFfmpeg: () => Promise<ToolStatus>;
  installFfmpeg: () => Promise<void>;
  onFfmpegInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
  installDependencies: () => Promise<InstallDependenciesResult>;
  onDependencyInstallProgress: (
    callback: (progress: DependencyInstallProgress) => void
  ) => () => void;
}

// ── updater ───────────────────────────────────────────────────────────────

/** Release metadata carried by the update-available / -downloaded events. */
export interface UpdateInfo {
  version: string;
  releaseNotes: string | null;
  releaseDate: string;
}

/** Byte-level progress of an in-flight update download. */
export interface UpdateDownloadProgress {
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
  onDownloadProgress: (callback: (progress: UpdateDownloadProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateError: (callback: (message: string) => void) => () => void;
}

// ── radio ─────────────────────────────────────────────────────────────────

export interface RadioFavoritesApi {
  getAll: () => Promise<RadioFavorite[]>;
  add: (station: RadioStationInput) => Promise<RadioFavorite>;
  remove: (stationUuid: string) => Promise<void>;
  isFavorite: (stationUuid: string) => Promise<boolean>;
}

/**
 * What a station said it is playing, de-framed from its ICY metadata.
 *
 * `raw` is the source of truth — the `StreamTitle` exactly as it decoded — and
 * is what the UI renders. `artist`/`title` are a best-effort split on the
 * `Artist - Title` convention and are null whenever the string does not carry
 * it, which is often: idents, ads and bare track names all arrive here.
 *
 * `streamUrl` is the station URL the renderer asked for, so a title arriving
 * late from a station the user already left can be ignored rather than shown.
 */
export interface RadioNowPlaying {
  streamUrl: string;
  raw: string;
  artist: string | null;
  title: string | null;
}

export interface RadioApi {
  favorites: RadioFavoritesApi;
  /**
   * The station's now-playing title, one call per *change*. v2-only: v1
   * declined ICY metadata, so the Electron preload leaves this undefined and
   * the renderer feature-detects.
   */
  onNowPlaying?: (callback: (playing: RadioNowPlaying) => void) => () => void;
}

// ── shell ─────────────────────────────────────────────────────────────────

export interface ShellApi {
  showInFolder: (filePath: string) => Promise<void>;
  trashFile: (filePath: string) => Promise<void>;
}

// ── playlist (external playlist extraction) ───────────────────────────────

/** Progress event streamed while resolving an external playlist's tracks. */
export interface PlaylistExtractProgress {
  current: number;
  total: number;
  trackName: string;
}

export interface PlaylistApi {
  extract: (url: string) => Promise<PlaylistExtractResult>;
  cancel: () => Promise<void>;
  onExtractProgress: (callback: (data: PlaylistExtractProgress) => void) => () => void;
}

// ── metadata ──────────────────────────────────────────────────────────────

export interface MetadataApi {
  lookup: (title: string, artist: string) => Promise<MetadataLookupResult>;
  enrichTracks: (
    tracks: EnrichTrackInput[],
    options: { writeToFile: boolean; onlyMissing: boolean }
  ) => Promise<EnrichTrackResult[]>;
  /**
   * Look-up-only single-track enrichment. Returns the would-be `updatedFields`
   * (and a cached cover URL when one was downloaded) WITHOUT writing tags or
   * mutating the DB. The renderer is responsible for the apply step. Rejects
   * with code `metadata.enrich_busy` when a bulk run holds the abort slot.
   */
  previewEnrich: (
    track: EnrichTrackInput,
    options: { onlyMissing: boolean }
  ) => Promise<EnrichTrackResult>;
  cancelEnrichment: () => Promise<void>;
  onEnrichProgress: (callback: (data: EnrichProgress) => void) => () => void;
  /**
   * Write user-edited tags back to the audio file and update the DB row. Used
   * by the manual tag editor (distinct from the automatic enrichment flow).
   */
  writeTags: (input: WriteTagsInput) => Promise<WriteTagsResult>;
}

// ── recommendations ───────────────────────────────────────────────────────

export interface RecommendationsApi {
  /** Read both shelves from the cache (fast; library recomputes inline if stale). */
  get: () => Promise<RecommendationShelves>;
  /** Run the background refresh (affinity + yt-dlp RD-mix) and return fresh shelves. */
  refresh: () => Promise<RecommendationShelves>;
  /** "More like this": rank library tracks by content similarity to a seed. */
  similar: (seedTrackId: string) => Promise<SimilarTrackResult[]>;
  /** Mark a track "Not interested" so the affinity engine stops surfacing it. */
  notInterested: (trackId: string) => Promise<void>;
  /** Undo a previous "Not interested" mark for a track. */
  undoNotInterested: (trackId: string) => Promise<void>;
  /**
   * Generate mood/activity/decade mixes from contextual signals + metadata.
   * Resolves to `null` when generation fails (distinct from `[]` = no mixes
   * apply) so the renderer can show an honest error rather than the
   * empty-library state.
   */
  smartMixes: (signals: SmartMixSignals) => Promise<SmartMixResult[] | null>;
}

// ── scrobble ──────────────────────────────────────────────────────────────

export interface ScrobbleApi {
  /** Read the connection status (booleans + display name only; never secrets). */
  getStatus: () => Promise<ScrobbleStatus>;
  /** Toggle the master opt-in switch. */
  setEnabled: (enabled: boolean) => Promise<ScrobbleStatus>;
  /** Open the Last.fm auth page; returns the request token to complete with. */
  lastfmBeginAuth: () => Promise<{ ok: boolean; token?: string; error?: string }>;
  /** Exchange the approved Last.fm token for a stored session key. */
  lastfmCompleteAuth: (token: string) => Promise<LastfmConnectResult>;
  /** Disconnect Last.fm (forget the session key). */
  lastfmDisconnect: () => Promise<ScrobbleStatus>;
  /** Validate + store a ListenBrainz user token. */
  listenBrainzConnect: (token: string) => Promise<ListenBrainzConnectResult>;
  /** Disconnect ListenBrainz (forget the token). */
  listenBrainzDisconnect: () => Promise<ScrobbleStatus>;
}

// ── share ─────────────────────────────────────────────────────────────────

/** A minted share link: the short code, its URL, and when it lapses. */
export interface ShareCode {
  code: string;
  url: string;
  expiresAt: string;
}

export interface ShareApi {
  track: (trackId: string) => Promise<ShareCode>;
  playlist: (playlistId: string) => Promise<ShareCode>;
  /**
   * The main-process handler validates this against `shareImportResponseSchema`,
   * so the renderer receives a fully-typed discriminated union, not raw unknown.
   */
  import: (code: string) => Promise<ShareImportResponse>;
  cacheYoutubeId: (trackId: string, youtubeId: string) => Promise<void>;
  onDeepLink: (callback: (code: string) => void) => () => void;
}

// ── debug ─────────────────────────────────────────────────────────────────

export interface DebugApi {
  /** Begin main-process metrics sampling (~1 Hz). Idempotent. */
  start: () => Promise<void>;
  /** Stop sampling and clear the interval. Idempotent. */
  stop: () => Promise<void>;
  /** Subscribe to main-process metric snapshots. Returns an unsubscribe fn. */
  onMetrics: (callback: (snapshot: MainMetricsSnapshot) => void) => () => void;
}

// ── system ────────────────────────────────────────────────────────────────

export interface SystemApi {
  onNotice: (callback: (notice: SystemNotice) => void) => () => void;
}

// ── storage ───────────────────────────────────────────────────────────────

export interface StorageApi {
  /**
   * Compute disk usage for the given watched library-folder paths. Returns one
   * entry per physical volume the folders live on.
   */
  getUsage: (folderPaths: string[]) => Promise<DiskUsageResult>;
}

// ── errors ────────────────────────────────────────────────────────────────

/** The structured rejection shape `isIpcError` narrows an unknown error to. */
export interface IpcErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ErrorsApi {
  isIpcError: (e: unknown) => e is IpcErrorPayload;
  SHARE_ERROR_CODES: typeof SHARE_ERROR_CODES;
  PLAYLIST_ERROR_CODES: typeof PLAYLIST_ERROR_CODES;
  VALIDATION_ERROR_CODES: typeof VALIDATION_ERROR_CODES;
}

// ── composed surface ──────────────────────────────────────────────────────

/**
 * Every namespace both sides can share verbatim. The preload's `ElectronAPI`
 * and the renderer's ambient `ElectronAPI` each add the three
 * environment-specific namespaces (`dialog`, `store`, `discord`) on top.
 */
export interface SharedElectronApi {
  window: WindowApi;
  app: AppApi;
  library: LibraryApi;
  /**
   * The one-pass analysis engine (F1/F2). v2-only, hence optional: the v1
   * preload also implements this interface and has no engine to run — the
   * renderer feature-detects and hides the card where this is absent.
   */
  analysis?: AnalysisApi;
  /**
   * The Library Doctor (F8). v2-only, hence optional: the v1 preload also
   * implements this interface and its decoder cannot produce the findings —
   * the renderer feature-detects and hides the card where this is absent.
   */
  doctor?: DoctorApi;
  /**
   * The desk companion's ledger (v2 companion, Phase 1). v2-only, hence
   * optional: the v1 preload also implements this interface and has no
   * companion — the renderer feature-detects and keeps the perch empty
   * where this is absent.
   */
  companion?: CompanionApi;
  loudness: LoudnessApi;
  waveform: WaveformApi;
  db: DbApi;
  lyrics: LyricsApi;
  weather: WeatherApi;
  media: MediaApi;
  downloader: DownloaderApi;
  updater: UpdaterApi;
  shell: ShellApi;
  radio: RadioApi;
  playlist: PlaylistApi;
  metadata: MetadataApi;
  recommendations: RecommendationsApi;
  scrobble: ScrobbleApi;
  share: ShareApi;
  debug: DebugApi;
  system: SystemApi;
  storage: StorageApi;
  errors: ErrorsApi;
  platform: NodeJS.Platform;
  /**
   * True only when the main process was launched with SHIRANAMI_E2E=1.
   * The renderer reads this and conditionally registers store handles on
   * `window.__shiranami` so e2e specs can drive playback / library state
   * via `page.evaluate`. Always-on rather than a dynamic call so the check
   * is synchronous at bootstrap.
   */
  __e2e: boolean;
}
