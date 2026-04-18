import { describe, it, expect } from 'vitest';
import {
  metadataLookupArgs,
  metadataEnrichTracksArgs,
  metadataEnrichCancelArgs,
  enrichTrackInputSchema,
} from './metadata';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

const validTrack = {
  id: UUID,
  filePath: '/music/a.mp3',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  albumArt: null,
  genre: '',
  year: null,
  trackNumber: null,
};

describe('metadata payload schemas', () => {
  describe('metadataLookupArgs', () => {
    it('accepts (title, artist)', () => {
      expect(metadataLookupArgs.safeParse(['Song', 'Artist']).success).toBe(true);
    });

    it('rejects missing second arg', () => {
      expect(metadataLookupArgs.safeParse(['Song']).success).toBe(false);
    });

    it('rejects non-string', () => {
      expect(metadataLookupArgs.safeParse(['Song', 42]).success).toBe(false);
    });
  });

  describe('enrichTrackInputSchema', () => {
    it('accepts a full valid track', () => {
      expect(enrichTrackInputSchema.safeParse(validTrack).success).toBe(true);
    });

    it('accepts albumArt as null', () => {
      expect(
        enrichTrackInputSchema.safeParse({ ...validTrack, albumArt: null })
          .success,
      ).toBe(true);
    });

    it('rejects non-uuid id', () => {
      expect(
        enrichTrackInputSchema.safeParse({ ...validTrack, id: 'bad' }).success,
      ).toBe(false);
    });
  });

  describe('metadataEnrichTracksArgs', () => {
    it('accepts (tracks[], options)', () => {
      expect(
        metadataEnrichTracksArgs.safeParse([
          [validTrack],
          { writeToFile: true, onlyMissing: false },
        ]).success,
      ).toBe(true);
    });

    it('rejects missing options', () => {
      expect(metadataEnrichTracksArgs.safeParse([[validTrack]]).success).toBe(false);
    });

    it('rejects non-boolean writeToFile', () => {
      expect(
        metadataEnrichTracksArgs.safeParse([
          [validTrack],
          { writeToFile: 'yes', onlyMissing: false },
        ]).success,
      ).toBe(false);
    });
  });

  describe('metadataEnrichCancelArgs', () => {
    it('accepts zero args', () => {
      expect(metadataEnrichCancelArgs.safeParse([]).success).toBe(true);
    });

    it('rejects extra args', () => {
      expect(metadataEnrichCancelArgs.safeParse(['x']).success).toBe(false);
    });
  });
});
