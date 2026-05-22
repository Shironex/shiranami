import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  detectPlaylistType,
  extractSpotifyPlaylistId,
  parseSpotifyEmbedHtml,
  parseYtDlpJsonLines,
} from './playlist';

const here = dirname(fileURLToPath(import.meta.url));
const embedFixture = readFileSync(
  resolve(here, '__fixtures__/spotify-embed-playlist.html'),
  'utf8'
);

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
    expect(detectPlaylistType('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe(
      'spotify'
    );
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
      extractSpotifyPlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123')
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

describe('parseSpotifyEmbedHtml', () => {
  it('extracts every track from a real embed __NEXT_DATA__ fixture', () => {
    const tracks = parseSpotifyEmbedHtml(embedFixture);
    expect(tracks).toHaveLength(3);
    expect(tracks.map(t => t.title)).toEqual(['Janice STFU', 'Babydoll', 'DAISIES']);
  });

  // Regression guard for the original bug: the parser read artists[].name and
  // never `subtitle`, so every artist came back "Unknown". The artist MUST come
  // from `subtitle`.
  it('maps the artist from `subtitle`, never "Unknown"', () => {
    const tracks = parseSpotifyEmbedHtml(embedFixture);
    expect(tracks.map(t => t.artist)).toEqual(['Drake', 'Dominic Fike', 'Justin Bieber']);
    for (const track of tracks) {
      expect(track.artist).not.toBe('Unknown');
    }
  });

  // Regression guard: `duration` is milliseconds and must be converted to the
  // scorer's `durationSec` via /1000 rounded.
  it('converts `duration` (ms) to durationSec via /1000 rounded', () => {
    const tracks = parseSpotifyEmbedHtml(embedFixture);
    // 237344ms -> 237, 97960ms -> 98, 176453ms -> 176.
    expect(tracks.map(t => t.durationSec)).toEqual([237, 98, 176]);
  });

  it('omits album and isrc (not present in the embed)', () => {
    const [first] = parseSpotifyEmbedHtml(embedFixture);
    expect(first.album).toBeUndefined();
    expect(first.isrc).toBeUndefined();
  });

  it('returns an empty array when no track data is present', () => {
    expect(parseSpotifyEmbedHtml('<html><body>nothing here</body></html>')).toEqual([]);
  });
});
