import { describe, it, expect } from 'vitest';
import { playlistExtractArgs, playlistCancelArgs } from './playlist';

describe('playlist (extraction) payload schemas', () => {
  describe('playlistExtractArgs', () => {
    it('accepts a URL string', () => {
      expect(playlistExtractArgs.safeParse(['https://open.spotify.com/playlist/123']).success).toBe(
        true
      );
    });

    it('rejects empty string', () => {
      expect(playlistExtractArgs.safeParse(['']).success).toBe(false);
    });

    it('rejects non-string', () => {
      expect(playlistExtractArgs.safeParse([42]).success).toBe(false);
    });
  });

  describe('playlistCancelArgs', () => {
    it('accepts zero args', () => {
      expect(playlistCancelArgs.safeParse([]).success).toBe(true);
    });

    it('rejects extra args', () => {
      expect(playlistCancelArgs.safeParse(['x']).success).toBe(false);
    });
  });
});
