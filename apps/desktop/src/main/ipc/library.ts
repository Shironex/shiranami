import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { parseAudioMetadata, isAudioFile, type TrackMetadata } from '../metadata-service';
import { logger } from '../logger';
import { forkScanUtility, type ScanUtilityClient } from '../scan-utility-host';
import { handle } from './with-ipc-handler';
import {
  parseMetadataArgs,
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
 */
async function parseAudioFilesViaUtility(
  utility: ScanUtilityClient,
  filePaths: string[]
): Promise<ScannedTrack[]> {
  const results: ScannedTrack[] = new Array(filePaths.length);
  for (let i = 0; i < filePaths.length; i += PARSE_CONCURRENCY) {
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
 * Spawn a one-shot scan-utility process, run an async function with it,
 * then kill it (RSS returns to the OS — the entire point of the migration).
 *
 * The utility is forked + initialised here, not lazily — early failures
 * should surface as IPC errors rather than mid-scan crashes.
 *
 * Test seam: `forkOverride` lets unit tests inject a fake client without
 * spinning up a real utilityProcess.
 */
async function withScanUtility<T>(
  fn: (utility: ScanUtilityClient) => Promise<T>,
  forkOverride?: () => ScanUtilityClient
): Promise<T> {
  const utility = forkOverride ? forkOverride() : forkScanUtility();
  try {
    await utility.ready;
    await utility.init({ userDataPath: app.getPath('userData') });
    return await fn(utility);
  } finally {
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
      const results = await withScanUtility(
        utility => parseAudioFilesViaUtility(utility, filePaths),
        forkOverrideForTest ?? undefined
      );
      logger.info(
        `[library] Parsed ${results.length} tracks in ${Date.now() - parseStart}ms (total: ${Date.now() - start}ms)`
      );
      return results;
    },
    { schema: scanFolderArgs }
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

      const result = await withScanUtility(async utility => {
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
      }, forkOverrideForTest ?? undefined);

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
}
