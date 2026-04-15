import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

const accessMock = vi.fn();
const readFileMock = vi.fn();

vi.mock('fs', () => ({
  promises: {
    access: (...args: unknown[]) => accessMock(...args),
    readFile: (...args: unknown[]) => readFileMock(...args),
  },
}));

vi.mock('./logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { loadLocalLyrics, stripLyricsHeader } from './local-lyrics';

const AUDIO = path.join('C:', 'Music', 'Artist', 'Song.mp3');
const DIR = path.dirname(AUDIO);
const BASE = 'Song';

/**
 * Helper: build a filesystem map and wire up access/readFile mocks.
 * Keys are absolute file paths; values are file contents.
 */
function setupFs(files: Record<string, string>): void {
  accessMock.mockImplementation(async (p: string) => {
    if (p in files) return undefined;
    throw new Error('ENOENT');
  });
  readFileMock.mockImplementation(async (p: string) => {
    if (p in files) return files[p];
    throw new Error('ENOENT');
  });
}

describe('stripLyricsHeader', () => {
  it('strips a simple key/value header with blank separator', () => {
    const input = 'Artist: Gary Moore\nTitle: Still Got The Blues\n\nWoke up this morning';
    expect(stripLyricsHeader(input)).toBe('Woke up this morning');
  });

  it('returns original when nothing looks like a header', () => {
    const input = 'Just some lyrics\nSecond line';
    expect(stripLyricsHeader(input)).toBe(input);
  });

  it('returns original if the whole file is header-shaped', () => {
    const input = 'Title: X\nArtist: Y';
    expect(stripLyricsHeader(input)).toBe(input);
  });

  it('does not strip [Chorus] section markers', () => {
    const input = '[Chorus]\nSing a song';
    expect(stripLyricsHeader(input)).toBe(input);
  });
});

describe('loadLocalLyrics', () => {
  beforeEach(() => {
    accessMock.mockReset();
    readFileMock.mockReset();
  });

  it('loads sibling .lrc with 3 timestamped lines', async () => {
    const lrcPath = path.join(DIR, `${BASE}.lrc`);
    setupFs({
      [lrcPath]: '[00:01.00]One\n[00:02.00]Two\n[00:03.00]Three',
    });
    const result = await loadLocalLyrics(AUDIO);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('local-lrc');
    expect(result!.synced).toHaveLength(3);
    expect(result!.plain).toBeNull();
  });

  it('loads sibling .txt with BOM and header stripped', async () => {
    const txtPath = path.join(DIR, `${BASE}.txt`);
    setupFs({
      [txtPath]: '\uFEFFArtist: Gary Moore\n\nWoke up this morning\nNo lyrics on my mind',
    });
    const result = await loadLocalLyrics(AUDIO);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('local-txt');
    expect(result!.synced).toBeNull();
    expect(result!.plain).toBe('Woke up this morning\nNo lyrics on my mind');
  });

  it('falls back to plain when .lrc has no timestamps', async () => {
    const lrcPath = path.join(DIR, `${BASE}.lrc`);
    const content = 'Just plain text\nNo timestamps here';
    setupFs({ [lrcPath]: content });
    const result = await loadLocalLyrics(AUDIO);
    expect(result).toEqual({
      synced: null,
      plain: content,
      source: 'local-lrc',
    });
  });

  it('finds lyrics via Lyrics/ subfolder', async () => {
    const subPath = path.join(DIR, 'Lyrics', `${BASE}.lrc`);
    setupFs({
      [subPath]: '[00:05.00]From subfolder',
    });
    const result = await loadLocalLyrics(AUDIO);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('local-lrc');
    expect(result!.synced).toEqual([{ time: 5, text: 'From subfolder' }]);
  });

  it('prefers .lrc over .txt when both exist', async () => {
    const lrcPath = path.join(DIR, `${BASE}.lrc`);
    const txtPath = path.join(DIR, `${BASE}.txt`);
    setupFs({
      [lrcPath]: '[00:01.00]From lrc',
      [txtPath]: 'From txt',
    });
    const result = await loadLocalLyrics(AUDIO);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('local-lrc');
    expect(result!.synced).toEqual([{ time: 1, text: 'From lrc' }]);
  });

  it('returns null when no lyrics file exists', async () => {
    setupFs({});
    const result = await loadLocalLyrics(AUDIO);
    expect(result).toBeNull();
  });

  it('parses .lrc with CRLF line endings', async () => {
    const lrcPath = path.join(DIR, `${BASE}.lrc`);
    setupFs({
      [lrcPath]: '[00:01.00]One\r\n[00:02.00]Two\r\n[00:03.00]Three',
    });
    const result = await loadLocalLyrics(AUDIO);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('local-lrc');
    expect(result!.synced).toHaveLength(3);
    expect(result!.synced![0]).toEqual({ time: 1, text: 'One' });
  });

  it('returns header-only .txt unchanged rather than empty', async () => {
    const txtPath = path.join(DIR, `${BASE}.txt`);
    const content = 'Title: X\nArtist: Y';
    setupFs({ [txtPath]: content });
    const result = await loadLocalLyrics(AUDIO);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('local-txt');
    expect(result!.plain).toBe(content);
  });
});
