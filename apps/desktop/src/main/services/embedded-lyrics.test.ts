import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readEmbeddedLyrics } from './embedded-lyrics';

// music-metadata is lazily imported inside embedded-lyrics; mock at the
// import specifier to return controlled fixtures (metadata-service pattern).
const parseFileMock = vi.fn();
vi.mock('music-metadata', () => ({
  parseFile: (...args: unknown[]) => parseFileMock(...args),
}));

const warnMock = vi.fn();
vi.mock('../app/logger', () => ({
  logger: {
    warn: (...args: unknown[]) => warnMock(...args),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
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
    expect(result).toEqual({
      synced: [
        { time: 1, text: 'first' },
        { time: 2.5, text: 'second' },
        { time: 5, text: 'third' },
      ],
      plain: null,
      source: 'embedded',
    });
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

  it('parses a raw LRC string in the text field into synced lines', async () => {
    const lrc = '[00:01.00]line one\n[00:02.50]line two\n[00:05.00]line three';
    parseFileMock.mockResolvedValueOnce({
      common: { lyrics: [{ text: lrc }] },
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
      common: { lyrics: [{ text: 'just some lyrics\nanother line' }] },
    });

    const result = await readEmbeddedLyrics('/fake/track.mp3');
    expect(result).toEqual({
      synced: null,
      plain: 'just some lyrics\nanother line',
      source: 'embedded',
    });
  });

  it('falls back to plain when LRC-looking text has no parseable lines', async () => {
    // Has a timestamp-shaped prefix but no text after any timestamp.
    const text = '[00:01.  broken markup that never parses';
    parseFileMock.mockResolvedValueOnce({
      common: { lyrics: [{ text }] },
    });

    const result = await readEmbeddedLyrics('/fake/track.mp3');
    expect(result).toEqual({ synced: null, plain: text, source: 'embedded' });
  });

  it('prefers a syncText entry over a plain text entry when both exist', async () => {
    parseFileMock.mockResolvedValueOnce({
      common: {
        lyrics: [
          { text: 'some plain lyrics with lots of text that would otherwise win' },
          { syncText: [{ timestamp: 1000, text: 'synced line' }] },
        ],
      },
    });

    const result = await readEmbeddedLyrics('/fake/track.mp3');
    expect(result?.synced).toEqual([{ time: 1, text: 'synced line' }]);
    expect(result?.plain).toBeNull();
  });

  it('picks the longest text entry when several exist', async () => {
    parseFileMock.mockResolvedValueOnce({
      common: { lyrics: [{ text: 'short' }, { text: 'a much longer set of lyrics' }] },
    });

    const result = await readEmbeddedLyrics('/fake/track.mp3');
    expect(result?.plain).toBe('a much longer set of lyrics');
  });

  it('returns null when common.lyrics is undefined', async () => {
    parseFileMock.mockResolvedValueOnce({ common: {} });
    expect(await readEmbeddedLyrics('/fake/track.mp3')).toBeNull();
  });

  it('returns null when common.lyrics is an empty array', async () => {
    parseFileMock.mockResolvedValueOnce({ common: { lyrics: [] } });
    expect(await readEmbeddedLyrics('/fake/track.mp3')).toBeNull();
  });

  it('logs a warning and returns null when parseFile throws', async () => {
    parseFileMock.mockRejectedValueOnce(new Error('boom'));
    expect(await readEmbeddedLyrics('/fake/bad.mp3')).toBeNull();
    expect(warnMock).toHaveBeenCalledTimes(1);
  });
});
