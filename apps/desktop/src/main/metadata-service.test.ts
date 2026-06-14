import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAudioFile, parseAudioMetadata } from './metadata-service';

// music-metadata is dynamically imported inside metadata-service, so we
// mock the module at its import specifier to return controlled fixtures.
const parseFileMock = vi.fn();
vi.mock('music-metadata', () => ({
  parseFile: (...args: unknown[]) => parseFileMock(...args),
}));

vi.mock('./art-protocol', () => ({
  saveAlbumArt: vi.fn(async () => 'shiranami-art://fake'),
}));

vi.mock('./app/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

describe('isAudioFile', () => {
  it.each(['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.opus', '.wma', '.weba', '.webm'])(
    'returns true for %s',
    ext => {
      expect(isAudioFile(`track${ext}`)).toBe(true);
    }
  );

  it('is case insensitive', () => {
    expect(isAudioFile('track.MP3')).toBe(true);
    expect(isAudioFile('track.Flac')).toBe(true);
    expect(isAudioFile('track.WAV')).toBe(true);
  });

  it('returns false for unsupported extensions', () => {
    expect(isAudioFile('file.txt')).toBe(false);
    expect(isAudioFile('image.png')).toBe(false);
    expect(isAudioFile('video.mp4')).toBe(false);
  });

  it('returns false for files with no extension', () => {
    expect(isAudioFile('noextension')).toBe(false);
  });
});

describe('parseAudioMetadata', () => {
  beforeEach(() => {
    parseFileMock.mockReset();
  });

  it('extracts discNumber from common.disk.no', async () => {
    parseFileMock.mockResolvedValueOnce({
      common: {
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        track: { no: 3 },
        disk: { no: 2 },
      },
      format: { duration: 180 },
    });

    const meta = await parseAudioMetadata('/music/song.mp3');

    expect(meta.discNumber).toBe(2);
    expect(meta.trackNumber).toBe(3);
  });

  it('returns null discNumber when common.disk is missing', async () => {
    parseFileMock.mockResolvedValueOnce({
      common: {
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        track: { no: 1 },
      },
      format: { duration: 180 },
    });

    const meta = await parseAudioMetadata('/music/song.mp3');

    expect(meta.discNumber).toBeNull();
    expect(meta.trackNumber).toBe(1);
  });

  it('returns null discNumber when disk has no number', async () => {
    parseFileMock.mockResolvedValueOnce({
      common: {
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        track: { no: 1 },
        disk: { no: null },
      },
      format: { duration: 180 },
    });

    const meta = await parseAudioMetadata('/music/song.mp3');
    expect(meta.discNumber).toBeNull();
  });

  it('returns null discNumber in the catch fallback when parsing fails', async () => {
    parseFileMock.mockRejectedValueOnce(new Error('boom'));

    const meta = await parseAudioMetadata('/music/song.mp3');

    expect(meta.discNumber).toBeNull();
    expect(meta.trackNumber).toBeNull();
    expect(meta.title).toBe('song');
  });
});
