import { describe, it, expect } from 'vitest';
import {
  audioMimeType,
  chunkRanges,
  contentLengthFromUrl,
  expiryFromUrl,
  parseRange,
  signAudioToken,
  verifyAudioToken,
} from './youtube-audio';

const KEY = 'server-key';
const NOW = 1_800_000_000;

describe('audio tokens', () => {
  it('verifies a token signed for the same video before it expires', () => {
    const token = signAudioToken(KEY, 'abcdefghijk', NOW + 60);
    expect(verifyAudioToken(KEY, 'abcdefghijk', token, NOW)).toBe(true);
  });

  it('rejects a token for another video', () => {
    const token = signAudioToken(KEY, 'abcdefghijk', NOW + 60);
    expect(verifyAudioToken(KEY, 'zzzzzzzzzzz', token, NOW)).toBe(false);
  });

  it('rejects an expired token', () => {
    const token = signAudioToken(KEY, 'abcdefghijk', NOW);
    expect(verifyAudioToken(KEY, 'abcdefghijk', token, NOW)).toBe(false);
  });

  it('rejects a token signed with another key', () => {
    const token = signAudioToken('other-key', 'abcdefghijk', NOW + 60);
    expect(verifyAudioToken(KEY, 'abcdefghijk', token, NOW)).toBe(false);
  });

  it('rejects a token whose expiry was pushed out', () => {
    const [, mac] = signAudioToken(KEY, 'abcdefghijk', NOW + 60).split('.');
    expect(verifyAudioToken(KEY, 'abcdefghijk', `${NOW + 999_999}.${mac}`, NOW)).toBe(false);
  });

  it('rejects malformed tokens', () => {
    for (const token of ['', 'abc', '123.', '.abc', `${NOW + 60}.short`, 'x.y.z']) {
      expect(verifyAudioToken(KEY, 'abcdefghijk', token, NOW)).toBe(false);
    }
  });
});

describe('parseRange', () => {
  const total = 1000;

  it('sends the whole body without a header or with one it ignores', () => {
    expect(parseRange(undefined, total)).toBeNull();
    expect(parseRange('', total)).toBeNull();
    expect(parseRange('bytes=-', total)).toBeNull();
    expect(parseRange('bytes=0-10,20-30', total)).toBeNull();
    expect(parseRange('items=0-10', total)).toBeNull();
    expect(parseRange('bytes=50-10', total)).toBeNull();
  });

  it('reads closed, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-99', total)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=900-', total)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', total)).toEqual({ start: 900, end: 999 });
  });

  it('clamps an end past the body and a suffix longer than it', () => {
    expect(parseRange('bytes=500-5000', total)).toEqual({ start: 500, end: 999 });
    expect(parseRange('bytes=-5000', total)).toEqual({ start: 0, end: 999 });
  });

  it('reports a start past the end, and an empty suffix, as unsatisfiable', () => {
    expect(parseRange('bytes=1000-', total)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', total)).toBe('unsatisfiable');
  });
});

describe('chunkRanges', () => {
  it('splits a range into pieces of at most the chunk size', () => {
    expect(chunkRanges({ start: 10, end: 34 }, 10)).toEqual([
      { start: 10, end: 19 },
      { start: 20, end: 29 },
      { start: 30, end: 34 },
    ]);
  });

  it('keeps a small range whole', () => {
    expect(chunkRanges({ start: 0, end: 0 }, 10)).toEqual([{ start: 0, end: 0 }]);
  });
});

describe('googlevideo URL params', () => {
  const url = 'https://rr1.googlevideo.com/videoplayback?expire=1794240690&clen=3655347&itag=140';

  it('reads clen and expire', () => {
    expect(contentLengthFromUrl(url)).toBe(3655347);
    expect(expiryFromUrl(url)).toBe(1794240690);
  });

  it('returns null when they are missing or the URL is broken', () => {
    expect(contentLengthFromUrl('https://example.com/a')).toBeNull();
    expect(expiryFromUrl('not a url')).toBeNull();
  });
});

describe('audioMimeType', () => {
  it('maps yt-dlp extensions', () => {
    expect(audioMimeType('m4a')).toBe('audio/mp4');
    expect(audioMimeType('webm')).toBe('audio/webm');
    expect(audioMimeType('weird')).toBe('application/octet-stream');
  });
});
