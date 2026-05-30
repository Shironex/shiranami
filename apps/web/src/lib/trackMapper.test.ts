import { describe, expect, it, vi } from 'vitest';
import { mapDbTrackToTrack, mapDbTracksToTracks, type DbTrackRecord } from './trackMapper';

vi.mock('@/lib/i18n', () => ({
  default: {
    t: (key: string) => {
      const map: Record<string, string> = {
        unknownArtist: 'Unknown Artist',
        unknownAlbum: 'Unknown Album',
      };
      return map[key] ?? key;
    },
  },
}));

const fullRecord: DbTrackRecord = {
  id: 'track-1',
  title: 'My Song',
  artist: 'Some Artist',
  albumArtist: 'Some Album Artist',
  album: 'Some Album',
  duration: 210,
  filePath: '/music/song.mp3',
  albumArt: 'data:image/png;base64,abc',
  genre: 'Rock',
  year: 2024,
  trackNumber: 3,
  discNumber: 1,
  isFavorite: true,
  playCount: 42,
  loudnessLufs: -16.5,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-02-01T00:00:00Z',
};

describe('mapDbTrackToTrack', () => {
  it('maps all fields from a full DB record', () => {
    const track = mapDbTrackToTrack(fullRecord);

    expect(track).toEqual({
      id: 'track-1',
      title: 'My Song',
      artist: 'Some Artist',
      albumArtist: 'Some Album Artist',
      album: 'Some Album',
      duration: 210,
      filePath: '/music/song.mp3',
      albumArt: 'data:image/png;base64,abc',
      genre: 'Rock',
      year: 2024,
      trackNumber: 3,
      discNumber: 1,
      isFavorite: true,
      playCount: 42,
      loudnessLufs: -16.5,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-02-01T00:00:00Z',
    });
  });

  it('falls back to translated default when artist is missing', () => {
    const record = { ...fullRecord, artist: undefined };
    const track = mapDbTrackToTrack(record);
    expect(track.artist).toBe('Unknown Artist');
  });

  it('falls back to translated default when artist is null', () => {
    const record = { ...fullRecord, artist: null };
    const track = mapDbTrackToTrack(record);
    expect(track.artist).toBe('Unknown Artist');
  });

  it('falls back to translated default when album is missing', () => {
    const record = { ...fullRecord, album: undefined };
    const track = mapDbTrackToTrack(record);
    expect(track.album).toBe('Unknown Album');
  });

  it('falls back to translated default when album is null', () => {
    const record = { ...fullRecord, album: null };
    const track = mapDbTrackToTrack(record);
    expect(track.album).toBe('Unknown Album');
  });

  it('converts null albumArt to undefined', () => {
    const record = { ...fullRecord, albumArt: null };
    const track = mapDbTrackToTrack(record);
    expect(track.albumArt).toBeUndefined();
  });

  it('converts missing albumArt to undefined', () => {
    const record = { ...fullRecord, albumArt: undefined };
    const track = mapDbTrackToTrack(record);
    expect(track.albumArt).toBeUndefined();
  });

  it('defaults isFavorite to false when missing', () => {
    const record = { ...fullRecord, isFavorite: undefined };
    const track = mapDbTrackToTrack(record);
    expect(track.isFavorite).toBe(false);
  });

  it('defaults playCount to 0 when missing', () => {
    const record = { ...fullRecord, playCount: undefined };
    const track = mapDbTrackToTrack(record);
    expect(track.playCount).toBe(0);
  });

  it('defaults duration to 0 when missing', () => {
    const record = { ...fullRecord, duration: undefined };
    const track = mapDbTrackToTrack(record);
    expect(track.duration).toBe(0);
  });
});

describe('mapDbTracksToTracks', () => {
  it('maps an array of DB records to Track objects', () => {
    const second: DbTrackRecord = {
      ...fullRecord,
      id: 'track-2',
      title: 'Another Song',
    };
    const tracks = mapDbTracksToTracks([fullRecord, second]);

    expect(tracks).toHaveLength(2);
    expect(tracks[0].id).toBe('track-1');
    expect(tracks[1].id).toBe('track-2');
    expect(tracks[1].title).toBe('Another Song');
  });

  it('returns an empty array for empty input', () => {
    expect(mapDbTracksToTracks([])).toEqual([]);
  });
});
