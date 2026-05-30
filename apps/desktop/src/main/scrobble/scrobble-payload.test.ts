import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  playStartTimestamp,
  lastfmSignatureBase,
  lastfmScrobbleParams,
  lastfmNowPlayingParams,
  listenBrainzBody,
  type ScrobblePlay,
} from './scrobble-payload';

const play: ScrobblePlay = {
  artist: 'Nujabes',
  track: 'Aruarian Dance',
  album: 'Modal Soul',
  durationSeconds: 247,
  startedAt: 1_700_000_000,
};

describe('playStartTimestamp', () => {
  it('subtracts the played seconds from the event time (in seconds)', () => {
    expect(playStartTimestamp(1_700_000_030_000, 30)).toBe(1_700_000_000);
  });
  it('never returns a negative timestamp', () => {
    expect(playStartTimestamp(10_000, 999)).toBe(0);
  });
});

describe('lastfmSignatureBase', () => {
  it('sorts params alphabetically, concatenates name+value, appends secret', () => {
    const base = lastfmSignatureBase({ b: '2', a: '1' }, 'SECRET');
    expect(base).toBe('a1b2SECRET');
  });

  it('excludes format and api_sig from the signature', () => {
    const base = lastfmSignatureBase({ a: '1', format: 'json', api_sig: 'x' }, 'S');
    expect(base).toBe('a1S');
  });

  it('produces a 32-char md5 when hashed (matches the spec)', () => {
    const base = lastfmSignatureBase({ method: 'track.scrobble', sk: 'k' }, 's');
    const sig = createHash('md5').update(base, 'utf8').digest('hex');
    expect(sig).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('lastfmScrobbleParams', () => {
  it('includes the required scrobble params and the start timestamp', () => {
    const params = lastfmScrobbleParams(play, 'KEY', 'SK');
    expect(params.method).toBe('track.scrobble');
    expect(params.timestamp).toBe('1700000000');
    expect(params.artist).toBe('Nujabes');
    expect(params.duration).toBe('247');
    expect(params.sk).toBe('SK');
  });

  it('omits album/duration when absent', () => {
    const params = lastfmScrobbleParams({ artist: 'A', track: 'T', startedAt: 1 }, 'KEY', 'SK');
    expect(params.album).toBeUndefined();
    expect(params.duration).toBeUndefined();
  });
});

describe('lastfmNowPlayingParams', () => {
  it('uses updateNowPlaying and carries no timestamp', () => {
    const params = lastfmNowPlayingParams(play, 'KEY', 'SK');
    expect(params.method).toBe('track.updateNowPlaying');
    expect(params.timestamp).toBeUndefined();
  });
});

describe('listenBrainzBody', () => {
  it('builds a single listen with listened_at and metadata', () => {
    const body = listenBrainzBody(play, 'single');
    expect(body.listen_type).toBe('single');
    expect(body.payload[0].listened_at).toBe(1_700_000_000);
    expect(body.payload[0].track_metadata.artist_name).toBe('Nujabes');
    expect(body.payload[0].track_metadata.release_name).toBe('Modal Soul');
    expect(body.payload[0].track_metadata.additional_info?.duration).toBe(247);
  });

  it('omits listened_at for a playing_now listen', () => {
    const body = listenBrainzBody(play, 'playing_now');
    expect(body.listen_type).toBe('playing_now');
    expect(body.payload[0].listened_at).toBeUndefined();
  });
});
