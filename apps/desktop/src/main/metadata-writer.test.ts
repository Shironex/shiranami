import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNodeID3Update = vi.fn(() => true);
vi.mock('node-id3', () => ({
  default: { update: mockNodeID3Update },
}));

const mockWriteFlacTags = vi.fn(async () => {});
vi.mock('flac-tagger', () => ({
  writeFlacTags: mockWriteFlacTags,
}));

const mockIsFFmpegInstalled = vi.fn(() => true);
const mockGetFFmpegPath = vi.fn(() => '/mock/ffmpeg/bin/ffmpeg');
vi.mock('./ffmpeg-manager', () => ({
  isFFmpegInstalled: (...args: unknown[]) => mockIsFFmpegInstalled(...args),
  getFFmpegPath: (...args: unknown[]) => mockGetFFmpegPath(...args),
}));

const mockSaveAlbumArt = vi.fn(async () => 'shiranami-art://art/testhash.jpg');
vi.mock('./art-protocol', () => ({
  saveAlbumArt: (...args: unknown[]) => mockSaveAlbumArt(...args),
}));

const mockExecFile = vi.fn(
  (_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => cb(null)
);
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...(args as Parameters<typeof mockExecFile>)),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      writeFile: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      unlink: vi.fn(async () => {}),
    },
  };
});

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Import under test (after mocks) ─────────────────────────────────────────

import { writeMetadataToFile } from './metadata-writer';
import { logger } from './logger';

// ── Helpers ──────────────────────────────────────────────────────────────────

const baseOptions = {
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  genre: 'Rock',
  year: 2024,
  trackNumber: 1,
};

const coverOptions = {
  ...baseOptions,
  coverImageBuffer: Buffer.from('fake-image-data'),
  coverImageMime: 'image/jpeg',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('metadata-writer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFFmpegInstalled.mockReturnValue(true);
    mockNodeID3Update.mockReturnValue(true);
    mockSaveAlbumArt.mockResolvedValue('shiranami-art://art/testhash.jpg');
  });

  describe('format dispatch', () => {
    it('dispatches .mp3 to node-id3', async () => {
      await writeMetadataToFile('/music/song.mp3', baseOptions);
      expect(mockNodeID3Update).toHaveBeenCalledTimes(1);
      expect(mockWriteFlacTags).not.toHaveBeenCalled();
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('dispatches .flac to flac-tagger', async () => {
      await writeMetadataToFile('/music/song.flac', baseOptions);
      expect(mockWriteFlacTags).toHaveBeenCalledTimes(1);
      expect(mockNodeID3Update).not.toHaveBeenCalled();
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it.each(['.m4a', '.ogg', '.opus', '.aac', '.wma', '.weba', '.webm'])(
      'dispatches %s to FFmpeg',
      async (ext) => {
        await writeMetadataToFile(`/music/song${ext}`, baseOptions);
        expect(mockExecFile).toHaveBeenCalledTimes(1);
        expect(mockNodeID3Update).not.toHaveBeenCalled();
        expect(mockWriteFlacTags).not.toHaveBeenCalled();
      }
    );

    it('handles case-insensitive extensions', async () => {
      await writeMetadataToFile('/music/song.MP3', baseOptions);
      expect(mockNodeID3Update).toHaveBeenCalledTimes(1);
    });
  });

  describe('albumArtist / discNumber mapping', () => {
    const extended = { ...baseOptions, albumArtist: 'Various Artists', discNumber: 2 };

    it('maps albumArtist to TPE2 (performerInfo) and discNumber to TPOS (partOfSet) for mp3', async () => {
      await writeMetadataToFile('/music/song.mp3', extended);
      const tags = mockNodeID3Update.mock.calls[0][0] as Record<string, unknown>;
      expect(tags.performerInfo).toBe('Various Artists');
      expect(tags.partOfSet).toBe('2');
    });

    it('maps albumArtist/discNumber to vorbis comments for flac', async () => {
      await writeMetadataToFile('/music/song.flac', extended);
      const arg = mockWriteFlacTags.mock.calls[0][0] as { tagMap: Record<string, string> };
      expect(arg.tagMap.albumartist).toBe('Various Artists');
      expect(arg.tagMap.discnumber).toBe('2');
    });

    it('passes album_artist and disc metadata to ffmpeg', async () => {
      await writeMetadataToFile('/music/song.m4a', extended);
      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('album_artist=Various Artists');
      expect(args).toContain('disc=2');
    });
  });

  describe('cover art / albumArtUrl', () => {
    it('returns albumArtUrl when coverImageBuffer is provided', async () => {
      const result = await writeMetadataToFile('/music/song.mp3', coverOptions);
      expect(result).toBe('shiranami-art://art/testhash.jpg');
      expect(mockSaveAlbumArt).toHaveBeenCalledWith(
        coverOptions.coverImageBuffer,
        'image/jpeg'
      );
    });

    it('returns null when no cover image is provided', async () => {
      const result = await writeMetadataToFile('/music/song.mp3', baseOptions);
      expect(result).toBeNull();
      expect(mockSaveAlbumArt).not.toHaveBeenCalled();
    });

    it('requires both coverImageBuffer and coverImageMime for art save', async () => {
      const result = await writeMetadataToFile('/music/song.mp3', {
        ...baseOptions,
        coverImageBuffer: Buffer.from('data'),
        // coverImageMime intentionally omitted
      });
      expect(result).toBeNull();
      expect(mockSaveAlbumArt).not.toHaveBeenCalled();
    });
  });

  describe('unsupported format', () => {
    it('does not throw for unsupported extensions', async () => {
      const result = await writeMetadataToFile('/music/song.xyz', baseOptions);
      expect(result).toBeNull();
    });

    it('logs a warning for unsupported extensions', async () => {
      await writeMetadataToFile('/music/song.xyz', baseOptions);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported format')
      );
    });

    it('still returns albumArtUrl for unsupported format when cover is provided', async () => {
      const result = await writeMetadataToFile('/music/song.xyz', coverOptions);
      expect(result).toBe('shiranami-art://art/testhash.jpg');
    });
  });

  describe('error handling', () => {
    it('catches mp3 writer failure and still returns albumArtUrl', async () => {
      mockNodeID3Update.mockReturnValue(new Error('write failed'));

      const result = await writeMetadataToFile('/music/song.mp3', coverOptions);

      expect(result).toBe('shiranami-art://art/testhash.jpg');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write tags'),
        expect.any(Error)
      );
    });

    it('catches flac writer failure and logs error', async () => {
      mockWriteFlacTags.mockRejectedValueOnce(new Error('flac error'));

      const result = await writeMetadataToFile('/music/song.flac', coverOptions);

      expect(result).toBe('shiranami-art://art/testhash.jpg');
      expect(logger.error).toHaveBeenCalled();
    });

    it('catches ffmpeg writer failure and logs error', async () => {
      mockExecFile.mockImplementationOnce(
        (_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) =>
          cb(new Error('ffmpeg crashed'))
      );

      const result = await writeMetadataToFile('/music/song.m4a', coverOptions);

      expect(result).toBe('shiranami-art://art/testhash.jpg');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('FFmpeg arguments', () => {
    it('preserves embedded cover art with -map 0:v? when no new cover is supplied', async () => {
      await writeMetadataToFile('/music/song.m4a', baseOptions);

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const args = mockExecFile.mock.calls[0][1] as string[];
      // The optional video-stream mapping is what stops a text-only tag write
      // from dropping the embedded album art on m4a / ogg / opus files.
      expect(args).toContain('-map');
      expect(args).toContain('0:v?');
      // ...and it must NOT be the unconditional (drop-art) form.
      expect(args).not.toContain('0:v');
    });

    it('maps the supplied cover image as attached_pic instead of preserving the old one', async () => {
      await writeMetadataToFile('/music/song.m4a', coverOptions);

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('1:v');
      expect(args).toContain('attached_pic');
      // When a new cover is provided we don't also try to preserve a stale one.
      expect(args).not.toContain('0:v?');
    });
  });

  describe('FFmpeg availability', () => {
    it('skips writing when ffmpeg is not installed', async () => {
      mockIsFFmpegInstalled.mockReturnValue(false);

      const result = await writeMetadataToFile('/music/song.ogg', baseOptions);

      expect(result).toBeNull();
      expect(mockExecFile).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('ffmpeg not installed'),
        expect.any(String)
      );
    });

    it('skips writing but still saves cover art when ffmpeg is not installed', async () => {
      mockIsFFmpegInstalled.mockReturnValue(false);

      const result = await writeMetadataToFile('/music/song.ogg', coverOptions);

      expect(result).toBe('shiranami-art://art/testhash.jpg');
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });

  describe('mp3 tag mapping', () => {
    it('passes cover image to node-id3 as image tag', async () => {
      await writeMetadataToFile('/music/song.mp3', coverOptions);

      expect(mockNodeID3Update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Song',
          artist: 'Test Artist',
          album: 'Test Album',
          image: expect.objectContaining({
            mime: 'image/jpeg',
            imageBuffer: coverOptions.coverImageBuffer,
          }),
        }),
        '/music/song.mp3'
      );
    });

    it('skips update when no tags are provided', async () => {
      await writeMetadataToFile('/music/song.mp3', {});
      expect(mockNodeID3Update).not.toHaveBeenCalled();
    });
  });

  describe('flac tag mapping', () => {
    it('maps year to date field', async () => {
      await writeMetadataToFile('/music/song.flac', { year: 2024 });

      expect(mockWriteFlacTags).toHaveBeenCalledWith(
        expect.objectContaining({
          tagMap: expect.objectContaining({ date: '2024' }),
        }),
        '/music/song.flac'
      );
    });

    it('includes picture when cover buffer is provided', async () => {
      await writeMetadataToFile('/music/song.flac', coverOptions);

      expect(mockWriteFlacTags).toHaveBeenCalledWith(
        expect.objectContaining({
          picture: { buffer: coverOptions.coverImageBuffer },
        }),
        '/music/song.flac'
      );
    });

    it('skips writeFlac when no tags or picture provided', async () => {
      await writeMetadataToFile('/music/song.flac', {});
      expect(mockWriteFlacTags).not.toHaveBeenCalled();
    });
  });
});
