import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { parseAudioMetadata, isAudioFile, type TrackMetadata } from '../metadata-service';
import { logger } from '../logger';
import {
  forkScanUtility,
  ScanCancelledError,
  type ScanUtilityClient,
  type ScanProgressEvent,
} from '../scan-utility-host';
import { getMainWindow } from '../utils/window';
import { handle } from './with-ipc-handler';
import {
  parseMetadataArgs,
  scanCancelArgs,
  scanFolderArgs,
  scanFolderGroupedArgs,
  validateFilesArgs,
} from './schemas/library';

export interface ScannedTrack {
  filePath: string;
  metadata: TrackMetadata;
}

async function scanDirectoryRecursive(dirPath: string, maxDepth = 5, depth = 0): Promise<string[]> {
  if (depth > maxDepth) return [];

  const files: string[] = [];
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await scanDirectoryRecursive(fullPath, maxDepth, depth + 1);
        files.push(...subFiles);
      } else if (entry.isFile() && isAudioFile(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    logger.warn('[library] Failed to scan directory:', dirPath, error);
  }
  return files;
}

export interface GroupedScanResult {
  rootTracks: ScannedTrack[];
  subfolders: Array<{
    name: string;
    path: string;
    tracks: ScannedTrack[];
  }>;
}

async function scanDirectoryGrouped(dirPath: string): Promise<{
  rootFiles: string[];
  subfolders: Array<{ name: string; path: string; files: string[] }>;
}> {
  const rootFiles: string[] = [];
  const subfolders: Array<{ name: string; path: string; files: string[] }> = [];

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const files = await scanDirectoryRecursive(fullPath);
        if (files.length > 0) {
          subfolders.push({ name: entry.name, path: fullPath, files });
        }
      } else if (entry.isFile() && isAudioFile(entry.name)) {
        rootFiles.push(fullPath);
      }
    }
  } catch (error) {
    logger.warn('[library] Failed to scan directory for grouping:', dirPath, error);
  }

  return { rootFiles, subfolders };
}

const PARSE_CONCURRENCY = 16;

/**
 * Map a utility ParseResult into the renderer-facing TrackMetadata shape.
 * On parse failure, fall back to the same filename-derived placeholder
 * `metadata-service.parseAudioMetadata` produced before this migration —
 * keeps the renderer contract identical.
 */
function fallbackMetadata(filePath: string): TrackMetadata {
  const fileName = path.basename(filePath, path.extname(filePath));
  return {
    title: fileName,
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    duration: 0,
    genre: '',
    year: null,
    trackNumber: null,
    discNumber: null,
    albumArt: null,
  };
}

/**
 * Parse a batch of files through a single utility-process client. Mirrors
 * the previous in-process concurrency=16 worker-pool shape; the utility now
 * owns the heavy work and main only orchestrates.
 *
 * Per-file rejections are absorbed and emit fallback metadata so a single
 * bad file doesn't sink the scan. `ScanCancelledError` is the one exception:
 * it propagates so `withScanUtility` can rethrow it to the IPC layer instead
 * of the renderer receiving 50k fallback tracks for an aborted scan.
 */
async function parseAudioFilesViaUtility(
  utility: ScanUtilityClient,
  filePaths: string[]
): Promise<ScannedTrack[]> {
  const results: ScannedTrack[] = new Array(filePaths.length);
  for (let i = 0; i < filePaths.length; i += PARSE_CONCURRENCY) {
    if (utility.cancelled) throw new ScanCancelledError();
    const batch = filePaths.slice(i, i + PARSE_CONCURRENCY);
    const parsed = await Promise.all(
      batch.map(async filePath => {
        try {
          const result = await utility.parse(filePath);
          if (result.ok) {
            return { filePath, metadata: result.metadata };
          }
          logger.warn(`[library] utility parse failed for ${filePath}: ${result.error}`);
          return { filePath, metadata: fallbackMetadata(filePath) };
        } catch (err) {
          if (err instanceof ScanCancelledError) throw err;
          logger.warn(`[library] utility.parse rejected for ${filePath}:`, err);
          return { filePath, metadata: fallbackMetadata(filePath) };
        }
      })
    );
    for (let j = 0; j < parsed.length; j++) {
      results[i + j] = parsed[j];
    }
  }
  return results;
}

/**
 * Forward a host-side progress event to the renderer over the
 * `library:scan-progress` channel. No-op when no main window is mounted
 * (background scans during teardown).
 */
function forwardProgressToRenderer(evt: ScanProgressEvent): void {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('library:scan-progress', evt);
}

interface WithScanUtilityOptions {
  signal?: AbortSignal;
  forkOverride?: () => ScanUtilityClient;
  onProgress?: (evt: ScanProgressEvent) => void;
}

/**
 * Spawn a one-shot scan-utility process, run an async function with it,
 * then kill it (RSS returns to the OS — the entire point of the migration).
 *
 * The utility is forked + initialised here, not lazily — early failures
 * should surface as IPC errors rather than mid-scan crashes.
 *
 * Per-file progress events are streamed to the renderer for the duration
 * of the call; the listener is removed before the utility is killed.
 *
 * If `signal` is provided and aborts during the scan, `utility.cancel()`
 * fires — pending parses reject with `ScanCancelledError` and the utility
 * exits within ~2s (SIGTERM fallback if it doesn't). The wrapped error is
 * rethrown so the IPC layer can decide how to surface it.
 *
 * Test seam: `forkOverride` lets unit tests inject a fake client without
 * spinning up a real utilityProcess. `onProgress` lets tests observe the
 * progress stream without running the renderer.
 */
async function withScanUtility<T>(
  fn: (utility: ScanUtilityClient) => Promise<T>,
  opts: WithScanUtilityOptions = {}
): Promise<T> {
  const { signal, forkOverride, onProgress = forwardProgressToRenderer } = opts;
  const utility = forkOverride ? forkOverride() : forkScanUtility();
  const unsubscribe = utility.onProgress(onProgress);
  // If the signal is already aborted, cancel before any work starts so the
  // cancel arrives ahead of `init`.
  if (signal?.aborted) {
    utility.cancel();
  }
  const onAbort = () => {
    utility.cancel();
  };
  signal?.addEventListener('abort', onAbort);
  try {
    await utility.ready;
    await utility.init({ userDataPath: app.getPath('userData') });
    return await fn(utility);
  } finally {
    signal?.removeEventListener('abort', onAbort);
    unsubscribe();
    utility.kill();
  }
}

/**
 * Test-only seam: replaces the default `forkScanUtility` for the duration of
 * the next scan IPC call. Reset by tests in afterEach.
 */
let forkOverrideForTest: (() => ScanUtilityClient) | null = null;
export function _setForkOverrideForTest(fn: (() => ScanUtilityClient) | null): void {
  forkOverrideForTest = fn;
}

/**
 * Active scan AbortController. Set by scan-folder / scan-folder-grouped on
 * entry and cleared on exit. The `library:scan-cancel` IPC aborts whichever
 * is current. Concurrent scans are not supported (see plan §7-3) so a single
 * slot is enough.
 */
let activeScanAbort: AbortController | null = null;

export function registerLibraryHandlers(): void {
  // Parse metadata for a single file. Stays in-main: spawning a utility for
  // one file is overkill, and single-file parses don't accumulate the heap
  // pressure that drove the migration.
  handle(
    'library:parse-metadata',
    async (_event, filePath: string) => {
      const metadata = await parseAudioMetadata(filePath);
      return { filePath, metadata };
    },
    { schema: parseMetadataArgs }
  );

  // Scan a directory for audio files and parse their metadata via a forked
  // utility process. Process exits at the end of the scan → V8 heap returns
  // to OS, freeing 200-400 MB main RSS at idle after large scans.
  handle(
    'library:scan-folder',
    async (_event, dirPath: string) => {
      const start = Date.now();
      logger.info(`[library] Scanning folder: ${dirPath}`);
      const filePaths = await scanDirectoryRecursive(dirPath);
      logger.info(`[library] Found ${filePaths.length} audio files in ${Date.now() - start}ms`);

      if (filePaths.length === 0) return [];

      const parseStart = Date.now();
      const abort = new AbortController();
      activeScanAbort = abort;
      let results: ScannedTrack[];
      try {
        results = await withScanUtility(
          utility => {
            utility.setBatchSize(filePaths.length);
            return parseAudioFilesViaUtility(utility, filePaths);
          },
          {
            signal: abort.signal,
            forkOverride: forkOverrideForTest ?? undefined,
          }
        );
      } catch (err) {
        if (err instanceof ScanCancelledError) {
          logger.info(`[library] Scan cancelled after ${Date.now() - start}ms`);
          return [];
        }
        throw err;
      } finally {
        if (activeScanAbort === abort) activeScanAbort = null;
      }
      logger.info(
        `[library] Parsed ${results.length} tracks in ${Date.now() - parseStart}ms (total: ${Date.now() - start}ms)`
      );
      return results;
    },
    { schema: scanFolderArgs }
  );

  // Cancel the active scan (if any). The handler is best-effort: it returns
  // immediately and the actual scan promise rejects via ScanCancelledError,
  // which the scan IPC absorbs into an empty result.
  handle(
    'library:scan-cancel',
    async () => {
      if (activeScanAbort) {
        logger.info('[library] Scan cancellation requested');
        activeScanAbort.abort();
      } else {
        logger.info('[library] Scan cancel requested with no active scan');
      }
    },
    { schema: scanCancelArgs }
  );

  // Validate which file paths still exist on disk (returns paths that are missing)
  handle(
    'library:validate-files',
    async (_event, filePaths: string[]) => {
      const start = Date.now();
      logger.info(`[library] Validating ${filePaths.length} file paths`);
      const VALIDATE_CONCURRENCY = 128;
      const missing: string[] = [];

      for (let i = 0; i < filePaths.length; i += VALIDATE_CONCURRENCY) {
        const batch = filePaths.slice(i, i + VALIDATE_CONCURRENCY);
        const results = await Promise.all(
          batch.map(async filePath => {
            try {
              await fs.promises.access(filePath, fs.constants.F_OK);
              return null;
            } catch {
              return filePath;
            }
          })
        );
        for (const p of results) {
          if (p !== null) missing.push(p);
        }
      }

      if (missing.length > 0) {
        logger.warn(
          `[library] Validation found ${missing.length} missing files out of ${filePaths.length} (${Date.now() - start}ms)`
        );
      } else {
        logger.info(
          `[library] Validation complete: all ${filePaths.length} files exist (${Date.now() - start}ms)`
        );
      }
      return missing;
    },
    { schema: validateFilesArgs }
  );

  // Scan a directory and return results grouped by immediate subfolder.
  // Uses the same per-scan utility process as `scan-folder` — root files +
  // every subfolder go through one utility client, which then exits.
  handle(
    'library:scan-folder-grouped',
    async (_event, dirPath: string) => {
      const start = Date.now();
      logger.info(`[library] Scanning folder (grouped): ${dirPath}`);
      const { rootFiles, subfolders } = await scanDirectoryGrouped(dirPath);

      const totalFiles =
        rootFiles.length + subfolders.reduce((sum, sf) => sum + sf.files.length, 0);
      logger.info(
        `[library] Found ${totalFiles} audio files in ${subfolders.length} subfolders (${rootFiles.length} at root) in ${Date.now() - start}ms`
      );

      if (totalFiles === 0) {
        return { rootTracks: [], subfolders: [] } satisfies GroupedScanResult;
      }

      const abort = new AbortController();
      activeScanAbort = abort;
      let result: GroupedScanResult;
      try {
        result = await withScanUtility(
          async utility => {
            // Total fileCount across the whole grouped scan so progress events
            // give a single end-to-end percentage rather than resetting per
            // subfolder. The host's index counter is reset by setBatchSize().
            utility.setBatchSize(totalFiles);
            const rootTracks = await parseAudioFilesViaUtility(utility, rootFiles);

            const SUBFOLDER_CONCURRENCY = 4;
            const parsedSubfolders = [];
            for (let i = 0; i < subfolders.length; i += SUBFOLDER_CONCURRENCY) {
              const batch = subfolders.slice(i, i + SUBFOLDER_CONCURRENCY);
              const sub = await Promise.all(
                batch.map(async subfolder => {
                  const tracks = await parseAudioFilesViaUtility(utility, subfolder.files);
                  return { name: subfolder.name, path: subfolder.path, tracks };
                })
              );
              parsedSubfolders.push(...sub);
            }
            return { rootTracks, subfolders: parsedSubfolders } satisfies GroupedScanResult;
          },
          {
            signal: abort.signal,
            forkOverride: forkOverrideForTest ?? undefined,
          }
        );
      } catch (err) {
        if (err instanceof ScanCancelledError) {
          logger.info(`[library] Grouped scan cancelled after ${Date.now() - start}ms`);
          return { rootTracks: [], subfolders: [] } satisfies GroupedScanResult;
        }
        throw err;
      } finally {
        if (activeScanAbort === abort) activeScanAbort = null;
      }

      logger.info(
        `[library] Scan complete: ${totalFiles} files scanned and parsed in ${Date.now() - start}ms`
      );
      return result;
    },
    { schema: scanFolderGroupedArgs }
  );
}

export function cleanupLibraryHandlers(): void {
  ipcMain.removeHandler('library:parse-metadata');
  ipcMain.removeHandler('library:scan-folder');
  ipcMain.removeHandler('library:validate-files');
  ipcMain.removeHandler('library:scan-folder-grouped');
  ipcMain.removeHandler('library:scan-cancel');
}
