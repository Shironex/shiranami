import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readEmbeddedLyrics } from './embedded-lyrics';

// music-metadata is dynamically imported inside embedded-lyrics; mock at the
// import specifier to return controlled fixtures.
const parseFileMock = vi.fn();
vi.mock('music-metadata', () => ({
  parseFile: (...args: unknown[]) => parseFileMock(...args),
}));

const warnMock = vi.fn();
vi.mock('./logger', () => ({
  logger: { warn: (...args: unknown[]) => warnMock(...args), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('readEmbeddedLyrics', () => {
  beforeEach(() => {
    parseFileMock.mockReset();
    warnMock.mockReset();
  });

  it('returns synced lyrics from syncText (ms → s conversion)', async () => {
    parseFileMock.mockResolvedValueOnce({
      common: {
        lyrics: [
          {
            syncText: [
              { timestamp: 1000, text: 'first' },
              { timestamp: 2500, text: 'second' },
              { timestamp: 5000, text: 'third' },
            ],
          },
        ],
      },
    });

    const result = await readEmbeddedLyrics('/fake/track.mp3');
    expect(result).not.toBeNull();
    expect(result?.source).toBe('embedded');
    expect(result?.plain).toBeNull();
    expect(result?.synced).toEqual([
      { time: 1, text: 'first' },
      { time: 2.5, text: 'second' },
      { time: 5, text: 'third' },
    ]);
  });

  it('sorts syncText entries by time', async () => {
    parseFileMock.mockResolvedValueOnce({
      common: {
        lyrics: [
          {
            syncText: [
              { timestamp: 5000, text: 'c' },
              { timestamp: 1000, text: 'a' },
              { timestamp: 3000, text: 'b' },
            ],
          },
        ],
      },
    });

    const result = await readEmbeddedLyrics('/fake/track.mp3');
    expect(result?.synced?.map(l => l.text)).toEqual(['a', 'b', 'c']);
  });

  it('parses raw LRC string in text field into synced lines', async () => {
    const lrc = '[00:01.00]line one\n[00:02.50]line two\n[00:05.00]line three';
    parseFileMock.mockResolvedValueOnce({
      common: {
        lyrics: [{ text: lrc }],
      },
    });

    const result = await readEmbeddedLyrics('/fake/track.mp3');
    expect(result?.source).toBe('embedded');
    expect(result?.plain).toBeNull();
    expect(result?.synced).toEqual([
      { time: 1, text: 'line one' },
      { time: 2.5, text: 'line two' },
      { time: 5, text: 'line three' },
    ]);
  });

  it('returns plain for text without timestamps', async () => {
    parseFileMock.mockResolvedValueOnce({
      common: {
        lyrics: [{ text: 'just some lyrics\nanother line' }],
      },
    });

    const result = await readEmbeddedLyrics('/fake/track.mp3');
    expect(result).toEqual({
      synced: null,
      plain: 'just some lyrics\nanother line',
      source: 'embedded',
    });
  });

  it('returns null when common.lyrics is undefined', async () => {
    parseFileMock.mockResolvedValueOnce({ common: {} });
    const result = await readEmbeddedLyrics('/fake/track.mp3');
    expect(result).toBeNull();
  });

  it('returns null when common.lyrics is empty array', async () => {
    parseFileMock.mockResolvedValueOnce({ common: { lyrics: [] } });
    const result = await readEmbeddedLyrics('/fake/track.mp3');
    expect(result).toBeNull();
  });

  it('logs warn and returns null when parseFile throws', async () => {
    parseFileMock.mockRejectedValueOnce(new Error('boom'));
    const result = await readEmbeddedLyrics('/fake/bad.mp3');
    expect(result).toBeNull();
    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  it('prefers syncText entry over plain text entry when both exist', async () => {
    parseFileMock.mockResolvedValueOnce({
      common: {
        lyrics: [
          { text: 'some plain lyrics with lots of text that would otherwise win' },
          {
            syncText: [
              { timestamp: 1000, text: 'synced line' },
            ],
          },
        ],
      },
    });

    const result = await readEmbeddedLyrics('/fake/track.mp3');
    expect(result?.synced).toEqual([{ time: 1, text: 'synced line' }]);
    expect(result?.plain).toBeNull();
  });
});
