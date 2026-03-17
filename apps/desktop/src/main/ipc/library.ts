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

    const results: ScannedTrack[] = [];
    for (const filePath of filePaths) {
      const metadata = await parseAudioMetadata(filePath);
      results.push({ filePath, metadata });
    }
    return results;
  });
}

export function cleanupLibraryHandlers(): void {
  ipcMain.removeHandler('library:parse-metadata');
  ipcMain.removeHandler('library:parse-files');
  ipcMain.removeHandler('library:scan-folder');
}
