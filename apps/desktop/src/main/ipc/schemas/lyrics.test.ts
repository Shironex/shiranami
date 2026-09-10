import { describe, it, expect } from 'vitest';
import { lyricsFetchArgs } from './lyrics';

describe('lyrics payload schemas', () => {
  describe('lyricsFetchArgs', () => {
    it('accepts (title, artist)', () => {
      expect(lyricsFetchArgs.safeParse(['Song', 'Artist']).success).toBe(true);
    });

    it('accepts (title, artist, album)', () => {
      expect(lyricsFetchArgs.safeParse(['Song', 'Artist', 'Album']).success).toBe(true);
    });

    it('accepts (title, artist, album, duration)', () => {
      expect(lyricsFetchArgs.safeParse(['Song', 'Artist', 'Album', 180]).success).toBe(true);
    });

    it('rejects missing title', () => {
      expect(lyricsFetchArgs.safeParse(['']).success).toBe(false);
    });

    it('rejects missing artist', () => {
      expect(lyricsFetchArgs.safeParse(['Song']).success).toBe(false);
    });

    it('rejects non-number duration', () => {
      expect(lyricsFetchArgs.safeParse(['Song', 'Artist', 'Album', '180']).success).toBe(false);
    });
  });
});
