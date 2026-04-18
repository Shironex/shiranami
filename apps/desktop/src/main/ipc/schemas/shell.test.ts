import { describe, it, expect } from 'vitest';
import { showInFolderArgs, trashFileArgs } from './shell';

describe('shell payload schemas', () => {
  describe('showInFolderArgs', () => {
    it('accepts a single non-empty path string', () => {
      const result = showInFolderArgs.safeParse(['some/path/song.mp3']);
      expect(result.success).toBe(true);
    });

    it('rejects a numeric arg', () => {
      const result = showInFolderArgs.safeParse([123]);
      expect(result.success).toBe(false);
    });

    it('rejects empty args', () => {
      const result = showInFolderArgs.safeParse([]);
      expect(result.success).toBe(false);
    });

    it('rejects an empty string path', () => {
      const result = showInFolderArgs.safeParse(['']);
      expect(result.success).toBe(false);
    });

    it('rejects null', () => {
      const result = showInFolderArgs.safeParse([null]);
      expect(result.success).toBe(false);
    });
  });

  describe('trashFileArgs', () => {
    it('accepts a single non-empty path string', () => {
      const result = trashFileArgs.safeParse(['/tmp/gone.flac']);
      expect(result.success).toBe(true);
    });

    it('rejects a numeric arg', () => {
      const result = trashFileArgs.safeParse([123]);
      expect(result.success).toBe(false);
    });

    it('rejects empty args', () => {
      const result = trashFileArgs.safeParse([]);
      expect(result.success).toBe(false);
    });

    it('rejects an empty string path', () => {
      const result = trashFileArgs.safeParse(['']);
      expect(result.success).toBe(false);
    });

    it('rejects null', () => {
      const result = trashFileArgs.safeParse([null]);
      expect(result.success).toBe(false);
    });
  });
});
