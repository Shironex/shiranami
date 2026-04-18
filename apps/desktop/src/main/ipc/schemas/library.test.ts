import { describe, it, expect } from 'vitest';
import {
  parseMetadataArgs,
  scanFolderArgs,
  scanFolderGroupedArgs,
  validateFilesArgs,
} from './library';

describe('library payload schemas', () => {
  describe('parseMetadataArgs', () => {
    it('accepts a non-empty path', () => {
      expect(parseMetadataArgs.safeParse(['/music/song.mp3']).success).toBe(true);
    });

    it('rejects non-string', () => {
      expect(parseMetadataArgs.safeParse([42]).success).toBe(false);
    });

    it('rejects empty string', () => {
      expect(parseMetadataArgs.safeParse(['']).success).toBe(false);
    });
  });

  describe('scanFolderArgs', () => {
    it('accepts a directory path', () => {
      expect(scanFolderArgs.safeParse(['/music']).success).toBe(true);
    });

    it('rejects missing arg', () => {
      expect(scanFolderArgs.safeParse([]).success).toBe(false);
    });
  });

  describe('scanFolderGroupedArgs', () => {
    it('accepts a directory path', () => {
      expect(scanFolderGroupedArgs.safeParse(['/music']).success).toBe(true);
    });

    it('rejects null', () => {
      expect(scanFolderGroupedArgs.safeParse([null]).success).toBe(false);
    });
  });

  describe('validateFilesArgs', () => {
    it('accepts an array of non-empty paths', () => {
      expect(
        validateFilesArgs.safeParse([['/a.mp3', '/b.flac']]).success,
      ).toBe(true);
    });

    it('accepts an empty array', () => {
      expect(validateFilesArgs.safeParse([[]]).success).toBe(true);
    });

    it('rejects an array with an empty-string entry', () => {
      expect(validateFilesArgs.safeParse([['/a.mp3', '']]).success).toBe(false);
    });

    it('rejects a non-array arg', () => {
      expect(validateFilesArgs.safeParse(['/a.mp3']).success).toBe(false);
    });
  });
});
