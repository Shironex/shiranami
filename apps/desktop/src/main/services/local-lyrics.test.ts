import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { makeTempDir, cleanupTempDir } from '../../../test/setup';
import { loadLocalLyrics, stripLyricsHeader } from './local-lyrics';

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

  it('does not strip duet-style "He:"/"She:" dialogue lines', () => {
    const input = 'He: Hello there\nShe: Hi\nTogether now';
    expect(stripLyricsHeader(input)).toBe(input);
  });
});

describe('loadLocalLyrics', () => {
  let dir: string;
  let audioPath: string;

  beforeEach(() => {
    dir = makeTempDir();
    audioPath = path.join(dir, 'Song.mp3');
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('loads a sibling .lrc as synced lyrics', async () => {
    writeFileSync(path.join(dir, 'Song.lrc'), '[00:01.00]One\n[00:02.00]Two\n[00:03.00]Three');

    const result = await loadLocalLyrics(audioPath);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('local-lrc');
    expect(result!.plain).toBeNull();
    expect(result!.synced).toEqual([
      { time: 1, text: 'One' },
      { time: 2, text: 'Two' },
      { time: 3, text: 'Three' },
    ]);
  });

  it('loads a sibling .txt with BOM, CRLF, and header stripped', async () => {
    writeFileSync(
      path.join(dir, 'Song.txt'),
      '﻿Artist: Test Artist\r\n\r\nFirst line\r\nSecond line'
    );

    const result = await loadLocalLyrics(audioPath);
    expect(result).toEqual({
      synced: null,
      plain: 'First line\nSecond line',
      source: 'local-txt',
    });
  });

  it('falls back to plain when a .lrc has no timestamps', async () => {
    const content = 'Just plain text\nNo timestamps here';
    writeFileSync(path.join(dir, 'Song.lrc'), content);

    const result = await loadLocalLyrics(audioPath);
    expect(result).toEqual({ synced: null, plain: content, source: 'local-lrc' });
  });

  it('prefers a .txt over a timestampless .lrc', async () => {
    writeFileSync(path.join(dir, 'Song.lrc'), 'Just plain text\nNo timestamps here');
    writeFileSync(path.join(dir, 'Song.txt'), 'Proper plain lyrics');

    const result = await loadLocalLyrics(audioPath);
    expect(result).toEqual({
      synced: null,
      plain: 'Proper plain lyrics',
      source: 'local-txt',
    });
  });

  it('finds lyrics in a Lyrics/ subfolder', async () => {
    mkdirSync(path.join(dir, 'Lyrics'));
    writeFileSync(path.join(dir, 'Lyrics', 'Song.lrc'), '[00:05.00]From subfolder');

    const result = await loadLocalLyrics(audioPath);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('local-lrc');
    expect(result!.synced).toEqual([{ time: 5, text: 'From subfolder' }]);
  });

  it('finds a .txt in a lowercase lyrics/ subfolder', async () => {
    mkdirSync(path.join(dir, 'lyrics'));
    writeFileSync(path.join(dir, 'lyrics', 'Song.txt'), 'Plain from subfolder');

    const result = await loadLocalLyrics(audioPath);
    expect(result).toEqual({
      synced: null,
      plain: 'Plain from subfolder',
      source: 'local-txt',
    });
  });

  it('prefers a sibling .lrc over a sibling .txt', async () => {
    writeFileSync(path.join(dir, 'Song.lrc'), '[00:01.00]From lrc');
    writeFileSync(path.join(dir, 'Song.txt'), 'From txt');

    const result = await loadLocalLyrics(audioPath);
    expect(result!.source).toBe('local-lrc');
    expect(result!.synced).toEqual([{ time: 1, text: 'From lrc' }]);
  });

  it('ignores lyric files whose basename does not match the track', async () => {
    writeFileSync(path.join(dir, 'Other.lrc'), '[00:01.00]Wrong song');

    expect(await loadLocalLyrics(audioPath)).toBeNull();
  });

  it('returns null when no lyrics file exists', async () => {
    expect(await loadLocalLyrics(audioPath)).toBeNull();
  });

  it('returns a header-only .txt unchanged rather than empty', async () => {
    const content = 'Title: X\nArtist: Y';
    writeFileSync(path.join(dir, 'Song.txt'), content);

    const result = await loadLocalLyrics(audioPath);
    expect(result).toEqual({ synced: null, plain: content, source: 'local-txt' });
  });
});
