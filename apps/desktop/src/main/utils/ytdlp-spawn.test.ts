import { describe, it, expect } from 'vitest';
import { appendUrlArg } from './ytdlp-spawn';

/*
 * Regression coverage for the yt-dlp argument-injection (RCE) fix.
 *
 * yt-dlp treats any argument beginning with `-` as an option, so a
 * renderer/extraction-derived value like `--exec=<cmd>` passed as a positional
 * argument would run an arbitrary OS command. appendUrlArg must (1) reject any
 * non-http(s) value and (2) insert a literal `--` end-of-options separator so
 * the URL is always parsed positionally.
 */

describe('appendUrlArg', () => {
  it('appends the `--` end-of-options separator before a valid URL', () => {
    const args = appendUrlArg(
      ['-f', 'bestaudio', '--get-url'],
      'https://www.youtube.com/watch?v=abc'
    );
    expect(args).toEqual([
      '-f',
      'bestaudio',
      '--get-url',
      '--',
      'https://www.youtube.com/watch?v=abc',
    ]);
    // The `--` must come immediately before the URL, and the URL must be last.
    expect(args[args.length - 2]).toBe('--');
    expect(args[args.length - 1]).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('does not mutate the original args array', () => {
    const original = ['--flat-playlist', '--dump-json'];
    appendUrlArg(original, 'https://youtube.com/playlist?list=PL1');
    expect(original).toEqual(['--flat-playlist', '--dump-json']);
  });

  it('throws on an argument-injection payload instead of passing it to yt-dlp', () => {
    expect(() => appendUrlArg(['--get-url'], '--exec=calc.exe')).toThrow(/non-http/);
    expect(() => appendUrlArg(['--get-url'], '--downloader=/bin/sh')).toThrow(/non-http/);
    expect(() => appendUrlArg([], '-x')).toThrow(/non-http/);
  });

  it('throws on non-http(s) schemes', () => {
    expect(() => appendUrlArg([], 'file:///etc/passwd')).toThrow(/non-http/);
    expect(() => appendUrlArg([], 'ftp://example.com/x')).toThrow(/non-http/);
  });

  it('throws on empty / non-URL input', () => {
    expect(() => appendUrlArg([], '')).toThrow(/non-http/);
    expect(() => appendUrlArg([], 'not a url')).toThrow(/non-http/);
  });
});
