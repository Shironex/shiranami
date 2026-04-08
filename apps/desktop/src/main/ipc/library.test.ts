import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ipcHandlers, makeTempDir, cleanupTempDir } from '../../../test/setup';
import { registerLibraryHandlers, cleanupLibraryHandlers } from './library';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockParseAudioMetadata = vi.fn(async (filePath: string) => ({
  title: 'Test',
  artist: 'Artist',
  duration: 180,
  path: filePath,
}));

const REAL_AUDIO_EXTENSIONS = [
  '.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.opus', '.wma', '.weba', '.webm',
];

vi.mock('../metadata-service', () => ({
  parseAudioMetadata: (...args: unknown[]) => mockParseAudioMetadata(...(args as [string])),
  isAudioFile: vi.fn((filePath: string) =>
    REAL_AUDIO_EXTENSIONS.includes(path.extname(filePath).toLowerCase()),
  ),
}));

const event = null as never;

describe('library ipc handlers', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
    registerLibraryHandlers();
  });

  afterEach(() => {
    cleanupLibraryHandlers();
  });

  describe('library:validate-files', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
    });

    afterEach(() => {
      cleanupTempDir(tmpDir);
    });

    it('returns missing files from a mix of existing and non-existing paths', async () => {
      const existingFile = path.join(tmpDir, 'song.mp3');
      fs.writeFileSync(existingFile, '');

      const missingFile1 = path.join(tmpDir, 'deleted.mp3');
      const missingFile2 = path.join(tmpDir, 'gone.flac');

      const handler = ipcHandlers.get('library:validate-files')!;
      const missing = await handler(event, [existingFile, missingFile1, missingFile2]);

      expect(missing).toEqual([missingFile1, missingFile2]);
    });

    it('returns empty array when all files exist', async () => {
      const file1 = path.join(tmpDir, 'a.mp3');
      const file2 = path.join(tmpDir, 'b.flac');
      fs.writeFileSync(file1, '');
      fs.writeFileSync(file2, '');

      const handler = ipcHandlers.get('library:validate-files')!;
      const missing = await handler(event, [file1, file2]);

      expect(missing).toEqual([]);
    });

    it('returns all paths when none exist', async () => {
      const paths = ['/no/such/file.mp3', '/also/missing.flac'];
      const handler = ipcHandlers.get('library:validate-files')!;
      const missing = await handler(event, paths);

      expect(missing).toEqual(paths);
    });
  });

  describe('library:scan-folder', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
    });

    afterEach(() => {
      cleanupTempDir(tmpDir);
    });

    it('returns only audio files from nested directories', async () => {
      // Root files
      fs.writeFileSync(path.join(tmpDir, 'track1.mp3'), '');
      fs.writeFileSync(path.join(tmpDir, 'readme.txt'), '');
      fs.writeFileSync(path.join(tmpDir, 'cover.jpg'), '');

      // Subfolder with mixed files
      const sub = path.join(tmpDir, 'album');
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, 'track2.flac'), '');
      fs.writeFileSync(path.join(sub, 'notes.txt'), '');

      // Deeper nesting
      const deep = path.join(sub, 'disc2');
      fs.mkdirSync(deep);
      fs.writeFileSync(path.join(deep, 'track3.ogg'), '');

      const handler = ipcHandlers.get('library:scan-folder')!;
      const results = (await handler(event, tmpDir)) as Array<{
        filePath: string;
        metadata: unknown;
      }>;

      const filePaths = results.map((r) => r.filePath).sort();
      expect(filePaths).toEqual(
        [
          path.join(tmpDir, 'track1.mp3'),
          path.join(sub, 'track2.flac'),
          path.join(deep, 'track3.ogg'),
        ].sort(),
      );

      // Non-audio files must not appear
      const allPaths = results.map((r) => r.filePath);
      expect(allPaths.some((p) => p.endsWith('.txt'))).toBe(false);
      expect(allPaths.some((p) => p.endsWith('.jpg'))).toBe(false);
    });

    it('returns empty array for empty directory', async () => {
      const handler = ipcHandlers.get('library:scan-folder')!;
      const results = await handler(event, tmpDir);

      expect(results).toEqual([]);
    });

    it('respects maxDepth — files beyond the limit are ignored', async () => {
      // scanDirectoryRecursive uses maxDepth=5 by default (stops when depth > 5).
      // Build a directory tree 7 levels deep and verify only the first 6 levels
      // (depth 0 through 5) are scanned.
      let current = tmpDir;
      const allAudioFiles: string[] = [];
      for (let i = 0; i < 7; i++) {
        const file = path.join(current, `depth${i}.mp3`);
        fs.writeFileSync(file, '');
        allAudioFiles.push(file);

        const next = path.join(current, `level${i}`);
        fs.mkdirSync(next);
        current = next;
      }
      // depth 7 file — inside the 7th nested dir (depth > 5, should be excluded)
      const tooDeepFile = path.join(current, 'depth7.mp3');
      fs.writeFileSync(tooDeepFile, '');

      const handler = ipcHandlers.get('library:scan-folder')!;
      const results = (await handler(event, tmpDir)) as Array<{
        filePath: string;
        metadata: unknown;
      }>;
      const filePaths = results.map((r) => r.filePath);

      // Depth 0..5 files should be found (indices 0-5 in allAudioFiles, plus depth6 at depth=6)
      // The scan starts at depth=0 for tmpDir, recurses with depth+1.
      // depth > maxDepth (5) returns [], so depth=6 returns [].
      // Files at levels 0-5 should be present; level 6 file and the depth7 file should not.
      for (let i = 0; i < 6; i++) {
        expect(filePaths).toContain(allAudioFiles[i]);
      }
      // allAudioFiles[6] is at depth 6 (inside 6 nested dirs from root)
      expect(filePaths).not.toContain(allAudioFiles[6]);
      expect(filePaths).not.toContain(tooDeepFile);
    });
  });

  describe('library:scan-folder-grouped', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
    });

    afterEach(() => {
      cleanupTempDir(tmpDir);
    });

    it('separates root tracks from subfolder tracks', async () => {
      // Root audio
      fs.writeFileSync(path.join(tmpDir, 'loose.mp3'), '');

      // Subfolder with audio
      const albumDir = path.join(tmpDir, 'MyAlbum');
      fs.mkdirSync(albumDir);
      fs.writeFileSync(path.join(albumDir, 'track1.flac'), '');
      fs.writeFileSync(path.join(albumDir, 'track2.flac'), '');

      // Another subfolder — empty of audio (should not appear)
      const emptyDir = path.join(tmpDir, 'EmptyFolder');
      fs.mkdirSync(emptyDir);
      fs.writeFileSync(path.join(emptyDir, 'notes.txt'), '');

      const handler = ipcHandlers.get('library:scan-folder-grouped')!;
      const result = (await handler(event, tmpDir)) as {
        rootTracks: Array<{ filePath: string }>;
        subfolders: Array<{ name: string; path: string; tracks: Array<{ filePath: string }> }>;
      };

      // Root tracks
      expect(result.rootTracks).toHaveLength(1);
      expect(result.rootTracks[0].filePath).toBe(path.join(tmpDir, 'loose.mp3'));

      // Subfolders — only MyAlbum should appear (EmptyFolder has no audio)
      expect(result.subfolders).toHaveLength(1);
      expect(result.subfolders[0].name).toBe('MyAlbum');
      expect(result.subfolders[0].path).toBe(albumDir);
      expect(result.subfolders[0].tracks).toHaveLength(2);
    });
  });

  describe('library:parse-metadata', () => {
    it('delegates to parseAudioMetadata and returns the result', async () => {
      const handler = ipcHandlers.get('library:parse-metadata')!;
      const result = (await handler(event, '/music/song.mp3')) as {
        filePath: string;
        metadata: { title: string; artist: string; duration: number; path: string };
      };

      expect(mockParseAudioMetadata).toHaveBeenCalledWith('/music/song.mp3');
      expect(result.filePath).toBe('/music/song.mp3');
      expect(result.metadata).toEqual({
        title: 'Test',
        artist: 'Artist',
        duration: 180,
        path: '/music/song.mp3',
      });
    });
  });

  it('cleanupLibraryHandlers removes all handlers', () => {
    expect(ipcHandlers.has('library:parse-metadata')).toBe(true);
    expect(ipcHandlers.has('library:scan-folder')).toBe(true);
    expect(ipcHandlers.has('library:validate-files')).toBe(true);
    expect(ipcHandlers.has('library:scan-folder-grouped')).toBe(true);

    cleanupLibraryHandlers();

    expect(ipcHandlers.has('library:parse-metadata')).toBe(false);
    expect(ipcHandlers.has('library:scan-folder')).toBe(false);
    expect(ipcHandlers.has('library:validate-files')).toBe(false);
    expect(ipcHandlers.has('library:scan-folder-grouped')).toBe(false);
  });
});
