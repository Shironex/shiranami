import { describe, it, expect } from 'vitest';
import { mediaPlaybackStateArgs, mediaClearStateArgs } from './media';

const validState = {
  isPlaying: true,
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  duration: 180,
  currentTime: 30,
  albumArt: null,
};

describe('media payload schemas', () => {
  describe('mediaPlaybackStateArgs', () => {
    it('accepts a valid playback state', () => {
      expect(mediaPlaybackStateArgs.safeParse([validState]).success).toBe(true);
    });

    it('accepts a state with string albumArt', () => {
      expect(
        mediaPlaybackStateArgs.safeParse([
          { ...validState, albumArt: 'shiranami-art://hash' },
        ]).success,
      ).toBe(true);
    });

    it('rejects missing required field', () => {
      expect(
        mediaPlaybackStateArgs.safeParse([{ ...validState, isPlaying: undefined }])
          .success,
      ).toBe(false);
    });

    it('rejects non-boolean isPlaying', () => {
      expect(
        mediaPlaybackStateArgs.safeParse([{ ...validState, isPlaying: 1 }]).success,
      ).toBe(false);
    });
  });

  describe('mediaClearStateArgs', () => {
    it('accepts zero args', () => {
      expect(mediaClearStateArgs.safeParse([]).success).toBe(true);
    });

    it('rejects extra args', () => {
      expect(mediaClearStateArgs.safeParse([validState]).success).toBe(false);
    });
  });
});
