import { describe, it, expect } from 'vitest';
import {
  tracksGetAllArgs,
  tracksAddArgs,
  tracksAddManyArgs,
  tracksRemoveArgs,
  tracksRemoveManyArgs,
  tracksUpdateArgs,
  tracksUpdateManyArgs,
  tracksToggleFavoriteArgs,
  tracksGetFavoritesArgs,
  tracksIncrementPlayCountArgs,
  tracksExistsArgs,
  tracksExistsManyArgs,
  newTrackSchema,
  updateTrackSchema,
} from './db-tracks';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

const validTrack = {
  filePath: '/music/a.mp3',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  duration: 180,
};

describe('db:tracks payload schemas', () => {
  describe('newTrackSchema', () => {
    it('accepts a minimal valid track', () => {
      expect(
        newTrackSchema.safeParse({ filePath: '/a.mp3', title: 'x' }).success,
      ).toBe(true);
    });

    it('rejects when title missing', () => {
      expect(newTrackSchema.safeParse({ filePath: '/a.mp3' }).success).toBe(false);
    });

    it('rejects when filePath missing', () => {
      expect(newTrackSchema.safeParse({ title: 'x' }).success).toBe(false);
    });

    it('rejects when filePath is empty string', () => {
      expect(
        newTrackSchema.safeParse({ filePath: '', title: 'x' }).success,
      ).toBe(false);
    });
  });

  describe('updateTrackSchema', () => {
    it('accepts an empty object', () => {
      expect(updateTrackSchema.safeParse({}).success).toBe(true);
    });

    it('accepts a single-field update', () => {
      expect(updateTrackSchema.safeParse({ artist: 'new' }).success).toBe(true);
    });

    it('rejects non-object', () => {
      expect(updateTrackSchema.safeParse('oops').success).toBe(false);
    });
  });

  describe('tracksGetAllArgs / tracksGetFavoritesArgs', () => {
    it('accept zero args', () => {
      expect(tracksGetAllArgs.safeParse([]).success).toBe(true);
      expect(tracksGetFavoritesArgs.safeParse([]).success).toBe(true);
    });

    it('reject extra args', () => {
      expect(tracksGetAllArgs.safeParse(['extra']).success).toBe(false);
    });
  });

  describe('tracksAddArgs', () => {
    it('accepts a valid track', () => {
      expect(tracksAddArgs.safeParse([validTrack]).success).toBe(true);
    });

    it('rejects a missing-title track', () => {
      expect(
        tracksAddArgs.safeParse([{ filePath: '/a.mp3' }]).success,
      ).toBe(false);
    });
  });

  describe('tracksAddManyArgs', () => {
    it('accepts an array of tracks', () => {
      expect(tracksAddManyArgs.safeParse([[validTrack, validTrack]]).success).toBe(true);
    });

    it('rejects a non-array', () => {
      expect(tracksAddManyArgs.safeParse([validTrack]).success).toBe(false);
    });
  });

  describe('tracksRemoveArgs', () => {
    it('accepts a uuid', () => {
      expect(tracksRemoveArgs.safeParse([UUID]).success).toBe(true);
    });

    it('rejects a non-uuid string', () => {
      expect(tracksRemoveArgs.safeParse(['not-a-uuid']).success).toBe(false);
    });
  });

  describe('tracksRemoveManyArgs', () => {
    it('accepts an array of uuids', () => {
      expect(tracksRemoveManyArgs.safeParse([[UUID, UUID]]).success).toBe(true);
    });

    it('rejects an array with non-uuid entry', () => {
      expect(tracksRemoveManyArgs.safeParse([[UUID, 'bad']]).success).toBe(false);
    });
  });

  describe('tracksUpdateArgs', () => {
    it('accepts (uuid, partial)', () => {
      expect(tracksUpdateArgs.safeParse([UUID, { artist: 'new' }]).success).toBe(true);
    });

    it('rejects non-uuid first arg', () => {
      expect(tracksUpdateArgs.safeParse(['bad', { artist: 'x' }]).success).toBe(false);
    });
  });

  describe('tracksUpdateManyArgs', () => {
    it('accepts an array of {id, data}', () => {
      expect(
        tracksUpdateManyArgs.safeParse([
          [{ id: UUID, data: { artist: 'new' } }],
        ]).success,
      ).toBe(true);
    });

    it('rejects when id is not a uuid', () => {
      expect(
        tracksUpdateManyArgs.safeParse([
          [{ id: 'bad', data: {} }],
        ]).success,
      ).toBe(false);
    });
  });

  describe('tracksToggleFavoriteArgs / tracksIncrementPlayCountArgs', () => {
    it('accept a uuid', () => {
      expect(tracksToggleFavoriteArgs.safeParse([UUID]).success).toBe(true);
      expect(tracksIncrementPlayCountArgs.safeParse([UUID]).success).toBe(true);
    });

    it('reject non-uuid', () => {
      expect(tracksToggleFavoriteArgs.safeParse(['nope']).success).toBe(false);
    });
  });

  describe('tracksExistsArgs', () => {
    it('accepts a non-empty path', () => {
      expect(tracksExistsArgs.safeParse(['/a.mp3']).success).toBe(true);
    });

    it('rejects empty', () => {
      expect(tracksExistsArgs.safeParse(['']).success).toBe(false);
    });
  });

  describe('tracksExistsManyArgs', () => {
    it('accepts an array of paths', () => {
      expect(tracksExistsManyArgs.safeParse([['/a.mp3', '/b.flac']]).success).toBe(true);
    });

    it('rejects an array with empty entry', () => {
      expect(tracksExistsManyArgs.safeParse([['/a.mp3', '']]).success).toBe(false);
    });
  });
});
