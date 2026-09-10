import { describe, it, expect } from 'vitest';
import {
  playlistsGetAllArgs,
  playlistsGetArgs,
  playlistsCreateArgs,
  playlistsCreateWithTracksArgs,
  playlistsUpdateArgs,
  playlistsDeleteArgs,
  playlistsGetTracksArgs,
  playlistsAddTrackArgs,
  playlistsRemoveTrackArgs,
  playlistsGetPlaylistsForTracksArgs,
  playlistsReorderArgs,
} from './db-playlists';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '550e8400-e29b-41d4-a716-446655440001';

describe('db:playlists payload schemas', () => {
  describe('playlistsGetAllArgs', () => {
    it('accepts zero args', () => {
      expect(playlistsGetAllArgs.safeParse([]).success).toBe(true);
    });

    it('rejects extra args', () => {
      expect(playlistsGetAllArgs.safeParse(['extra']).success).toBe(false);
    });
  });

  describe('playlistsGetArgs / playlistsDeleteArgs / playlistsGetTracksArgs', () => {
    it('accept a uuid', () => {
      expect(playlistsGetArgs.safeParse([UUID]).success).toBe(true);
      expect(playlistsDeleteArgs.safeParse([UUID]).success).toBe(true);
      expect(playlistsGetTracksArgs.safeParse([UUID]).success).toBe(true);
    });

    it('reject non-uuid', () => {
      expect(playlistsGetArgs.safeParse(['nope']).success).toBe(false);
    });
  });

  describe('playlistsCreateArgs', () => {
    it('accepts just a name', () => {
      expect(playlistsCreateArgs.safeParse([{ name: 'Chill' }]).success).toBe(true);
    });

    it('accepts full input', () => {
      expect(
        playlistsCreateArgs.safeParse([
          { name: 'Chill', description: 'lofi beats', coverArt: 'art://x' },
        ]).success
      ).toBe(true);
    });

    it('rejects empty name', () => {
      expect(playlistsCreateArgs.safeParse([{ name: '' }]).success).toBe(false);
    });

    it('rejects missing name', () => {
      expect(playlistsCreateArgs.safeParse([{}]).success).toBe(false);
    });
  });

  describe('playlistsCreateWithTracksArgs', () => {
    it('accepts with track ids', () => {
      expect(
        playlistsCreateWithTracksArgs.safeParse([{ name: 'Mix', trackIds: [UUID, UUID2] }]).success
      ).toBe(true);
    });

    it('accepts with empty trackIds', () => {
      expect(playlistsCreateWithTracksArgs.safeParse([{ name: 'Mix', trackIds: [] }]).success).toBe(
        true
      );
    });

    it('rejects non-uuid track id', () => {
      expect(
        playlistsCreateWithTracksArgs.safeParse([{ name: 'Mix', trackIds: ['bad'] }]).success
      ).toBe(false);
    });
  });

  describe('playlistsUpdateArgs', () => {
    it('accepts (uuid, partial)', () => {
      expect(playlistsUpdateArgs.safeParse([UUID, { name: 'Renamed' }]).success).toBe(true);
    });

    it('accepts (uuid, {})', () => {
      expect(playlistsUpdateArgs.safeParse([UUID, {}]).success).toBe(true);
    });

    it('rejects empty name', () => {
      expect(playlistsUpdateArgs.safeParse([UUID, { name: '' }]).success).toBe(false);
    });
  });

  describe('playlistsAddTrackArgs / playlistsRemoveTrackArgs', () => {
    it('accept {playlistId, trackId}', () => {
      expect(playlistsAddTrackArgs.safeParse([{ playlistId: UUID, trackId: UUID2 }]).success).toBe(
        true
      );
      expect(
        playlistsRemoveTrackArgs.safeParse([{ playlistId: UUID, trackId: UUID2 }]).success
      ).toBe(true);
    });

    it('reject non-uuid trackId', () => {
      expect(playlistsAddTrackArgs.safeParse([{ playlistId: UUID, trackId: 'bad' }]).success).toBe(
        false
      );
    });
  });

  describe('playlistsGetPlaylistsForTracksArgs', () => {
    it('accepts array of uuids', () => {
      expect(playlistsGetPlaylistsForTracksArgs.safeParse([[UUID, UUID2]]).success).toBe(true);
    });

    it('accepts empty array', () => {
      expect(playlistsGetPlaylistsForTracksArgs.safeParse([[]]).success).toBe(true);
    });

    it('rejects array with non-uuid', () => {
      expect(playlistsGetPlaylistsForTracksArgs.safeParse([['bad']]).success).toBe(false);
    });
  });

  describe('playlistsReorderArgs', () => {
    it('accepts valid reorder payload', () => {
      expect(
        playlistsReorderArgs.safeParse([{ playlistId: UUID, trackIds: [UUID, UUID2] }]).success
      ).toBe(true);
    });

    it('rejects non-uuid playlistId', () => {
      expect(
        playlistsReorderArgs.safeParse([{ playlistId: 'bad', trackIds: [UUID] }]).success
      ).toBe(false);
    });

    it('rejects missing trackIds', () => {
      expect(playlistsReorderArgs.safeParse([{ playlistId: UUID }]).success).toBe(false);
    });
  });
});
