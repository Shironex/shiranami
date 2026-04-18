import { describe, it, expect } from 'vitest';
import {
  radioFavoritesGetAllArgs,
  radioFavoritesAddArgs,
  radioFavoritesRemoveArgs,
  radioFavoritesIsFavoriteArgs,
} from './radio';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

const validStation = {
  stationUuid: UUID,
  name: 'LoFi Radio',
  url: 'https://example.com/lofi',
  urlResolved: 'https://example.com/lofi.m3u',
};

describe('radio payload schemas', () => {
  describe('radioFavoritesGetAllArgs', () => {
    it('accepts zero args', () => {
      expect(radioFavoritesGetAllArgs.safeParse([]).success).toBe(true);
    });
  });

  describe('radioFavoritesAddArgs', () => {
    it('accepts a minimal valid station', () => {
      expect(radioFavoritesAddArgs.safeParse([validStation]).success).toBe(true);
    });

    it('accepts with optional fields', () => {
      expect(
        radioFavoritesAddArgs.safeParse([
          {
            ...validStation,
            homepage: 'https://example.com',
            bitrate: 128,
            tags: 'lofi,chill',
          },
        ]).success,
      ).toBe(true);
    });

    it('rejects non-uuid stationUuid', () => {
      expect(
        radioFavoritesAddArgs.safeParse([{ ...validStation, stationUuid: 'x' }])
          .success,
      ).toBe(false);
    });

    it('rejects empty name', () => {
      expect(
        radioFavoritesAddArgs.safeParse([{ ...validStation, name: '' }]).success,
      ).toBe(false);
    });
  });

  describe('radioFavoritesRemoveArgs / radioFavoritesIsFavoriteArgs', () => {
    it('accept a uuid', () => {
      expect(radioFavoritesRemoveArgs.safeParse([UUID]).success).toBe(true);
      expect(radioFavoritesIsFavoriteArgs.safeParse([UUID]).success).toBe(true);
    });

    it('reject non-uuid', () => {
      expect(radioFavoritesRemoveArgs.safeParse(['nope']).success).toBe(false);
    });
  });
});
