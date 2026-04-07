import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { parseAudioMetadata, isAudioFile, type TrackMetadata } from '../metadata-service';
import { logger } from '../logger';

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
    logger.warn('Failed to scan directory:', dirPath, error);
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
    logger.warn('Failed to scan directory for grouping:', dirPath, error);
  }

  return { rootFiles, subfolders };
}

const PARSE_CONCURRENCY = 16;

async function parseAudioFiles(filePaths: string[]): Promise<ScannedTrack[]> {
  const results: ScannedTrack[] = new Array(filePaths.length);
  for (let i = 0; i < filePaths.length; i += PARSE_CONCURRENCY) {
    const batch = filePaths.slice(i, i + PARSE_CONCURRENCY);
    const parsed = await Promise.all(
      batch.map(async (filePath) => {
        const metadata = await parseAudioMetadata(filePath);
        return { filePath, metadata };
      })
    );
    for (let j = 0; j < parsed.length; j++) {
      results[i + j] = parsed[j];
    }
  }
  return results;
}

export function registerLibraryHandlers(): void {
  // Parse metadata for a single file
  ipcMain.handle('library:parse-metadata', async (_event, filePath: string) => {
    const metadata = await parseAudioMetadata(filePath);
    return { filePath, metadata };
  });

  // Parse metadata for multiple files
  ipcMain.handle('library:parse-files', async (_event, filePaths: string[]) => {
    const results: ScannedTrack[] = [];
    for (const filePath of filePaths) {
      const metadata = await parseAudioMetadata(filePath);
      results.push({ filePath, metadata });
    }
    return results;
  });

  // Scan a directory for audio files and parse their metadata
  ipcMain.handle('library:scan-folder', async (_event, dirPath: string) => {
    logger.info('Scanning folder:', dirPath);
    const filePaths = await scanDirectoryRecursive(dirPath);
    logger.info(`Found ${filePaths.length} audio files`);

    return parseAudioFiles(filePaths);
  });

  // Validate which file paths still exist on disk (returns paths that are missing)
  ipcMain.handle('library:validate-files', async (_event, filePaths: string[]) => {
    const results = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          await fs.promises.access(filePath, fs.constants.F_OK);
          return null;
        } catch {
          return filePath;
        }
      })
    );
    return results.filter((p): p is string => p !== null);
  });

  // Scan a directory and return results grouped by immediate subfolder
  ipcMain.handle('library:scan-folder-grouped', async (_event, dirPath: string) => {
    logger.info('Scanning folder (grouped):', dirPath);
    const { rootFiles, subfolders } = await scanDirectoryGrouped(dirPath);

    const totalFiles = rootFiles.length + subfolders.reduce((sum, sf) => sum + sf.files.length, 0);
    logger.info(`Found ${totalFiles} audio files in ${subfolders.length} subfolders (${rootFiles.length} at root)`);

    const rootTracks = await parseAudioFiles(rootFiles);

    const parsedSubfolders = [];
    for (const subfolder of subfolders) {
      const tracks = await parseAudioFiles(subfolder.files);
      parsedSubfolders.push({ name: subfolder.name, path: subfolder.path, tracks });
    }

    return { rootTracks, subfolders: parsedSubfolders } satisfies GroupedScanResult;
  });
}

export function cleanupLibraryHandlers(): void {
  ipcMain.removeHandler('library:parse-metadata');
  ipcMain.removeHandler('library:parse-files');
  ipcMain.removeHandler('library:scan-folder');
  ipcMain.removeHandler('library:validate-files');
  ipcMain.removeHandler('library:scan-folder-grouped');
}
