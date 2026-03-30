import { describe, it, expect } from 'vitest';
import {
  detectPlaylistType,
  extractSpotifyPlaylistId,
  parseYtDlpJsonLines,
} from './playlist';

describe('detectPlaylistType', () => {
  it('detects youtube.com URLs', () => {
    expect(detectPlaylistType('https://www.youtube.com/playlist?list=PLxyz')).toBe('youtube');
  });

  it('detects youtu.be URLs', () => {
    expect(detectPlaylistType('https://youtu.be/abc123')).toBe('youtube');
  });

  it('detects music.youtube.com URLs', () => {
    expect(detectPlaylistType('https://music.youtube.com/playlist?list=PLxyz')).toBe('youtube');
  });

  it('detects Spotify playlist URLs', () => {
    expect(
      detectPlaylistType('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
    ).toBe('spotify');
  });

  it('returns unknown for non-playlist Spotify URLs', () => {
    expect(detectPlaylistType('https://open.spotify.com/track/abc')).toBe('unknown');
  });

  it('returns unknown for unrecognized URLs', () => {
    expect(detectPlaylistType('https://example.com/playlist')).toBe('unknown');
  });

  it('returns unknown for invalid URLs', () => {
    expect(detectPlaylistType('not-a-url')).toBe('unknown');
  });
});

describe('extractSpotifyPlaylistId', () => {
  it('extracts playlist ID', () => {
    expect(
      extractSpotifyPlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
    ).toBe('37i9dQZF1DXcBWIGoYBM5M');
  });

  it('extracts playlist ID with query params', () => {
    expect(
      extractSpotifyPlaylistId(
        'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123'
      )
    ).toBe('37i9dQZF1DXcBWIGoYBM5M');
  });

  it('returns null for invalid URL', () => {
    expect(extractSpotifyPlaylistId('not-a-url')).toBeNull();
  });

  it('returns null for non-playlist Spotify URL', () => {
    expect(extractSpotifyPlaylistId('https://open.spotify.com/track/abc')).toBeNull();
  });
});

describe('parseYtDlpJsonLines', () => {
  it('parses valid JSON lines', () => {
    const input = [
      JSON.stringify({ id: '1', title: 'Song A', uploader: 'Artist A', duration: 180 }),
      JSON.stringify({ id: '2', title: 'Song B', channel: 'Artist B', duration: 240 }),
    ].join('\n');

    const results = parseYtDlpJsonLines(input);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Song A');
    expect(results[1].uploader).toBe('Artist B');
  });

  it('skips malformed JSON lines', () => {
    const input = '{"id":"1","title":"Valid"}\nnot-json\n{"id":"2","title":"Also Valid"}';
    const results = parseYtDlpJsonLines(input);
    expect(results).toHaveLength(2);
  });

  it('skips empty lines', () => {
    const input = '{"id":"1","title":"Song"}\n\n\n{"id":"2","title":"Song2"}';
    const results = parseYtDlpJsonLines(input);
    expect(results).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(parseYtDlpJsonLines('')).toEqual([]);
  });

  it('provides defaults for missing fields', () => {
    const input = JSON.stringify({ id: 'x' });
    const results = parseYtDlpJsonLines(input);
    expect(results[0].title).toBe('Unknown');
    expect(results[0].uploader).toBe('Unknown');
    expect(results[0].duration).toBe(0);
  });
});
