import { describe, it, expect } from 'vitest';
import {
  shareTrackArgs,
  sharePlaylistArgs,
  shareImportArgs,
  shareCacheYoutubeIdArgs,
} from './share';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('share payload schemas', () => {
  describe('shareTrackArgs / sharePlaylistArgs', () => {
    it('accept a uuid', () => {
      expect(shareTrackArgs.safeParse([UUID]).success).toBe(true);
      expect(sharePlaylistArgs.safeParse([UUID]).success).toBe(true);
    });

    it('reject non-uuid', () => {
      expect(shareTrackArgs.safeParse(['bad']).success).toBe(false);
    });
  });

  describe('shareImportArgs', () => {
    it('accepts a share code', () => {
      expect(shareImportArgs.safeParse(['ABC123']).success).toBe(true);
    });

    it('rejects empty string', () => {
      expect(shareImportArgs.safeParse(['']).success).toBe(false);
    });
  });

  describe('shareCacheYoutubeIdArgs', () => {
    it('accepts (uuid, youtubeId)', () => {
      expect(shareCacheYoutubeIdArgs.safeParse([UUID, 'dQw4w9WgXcQ']).success).toBe(true);
    });

    it('rejects non-uuid track id', () => {
      expect(shareCacheYoutubeIdArgs.safeParse(['bad', 'dQw4w9WgXcQ']).success).toBe(false);
    });

    it('rejects empty youtubeId', () => {
      expect(shareCacheYoutubeIdArgs.safeParse([UUID, '']).success).toBe(false);
    });
  });
});
