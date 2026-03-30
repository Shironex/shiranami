import { describe, it, expect, vi } from 'vitest';
import { truncate, sanitizeField, buildPresence } from './discord-rpc';

vi.mock('./store', () => ({
  store: { get: vi.fn() },
}));

vi.mock('@xhayper/discord-rpc', () => ({
  Client: vi.fn(),
}));

describe('truncate', () => {
  it('returns text when within max', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates with ellipsis when over max', () => {
    const long = 'a'.repeat(200);
    const result = truncate(long, 10);
    expect(result.length).toBe(10);
    expect(result.endsWith('\u2026')).toBe(true);
  });

  it('returns text unchanged at exact max', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('sanitizeField', () => {
  it('returns undefined for null', () => {
    expect(sanitizeField(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(sanitizeField(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(sanitizeField('')).toBeUndefined();
  });

  it('returns undefined for single character (too short for Discord)', () => {
    expect(sanitizeField('a')).toBeUndefined();
  });

  it('returns trimmed text for valid input', () => {
    expect(sanitizeField('  hello  ')).toBe('hello');
  });

  it('truncates long text', () => {
    const long = 'a'.repeat(200);
    const result = sanitizeField(long);
    expect(result!.length).toBe(128);
  });
});

describe('buildPresence', () => {
  it('builds presence with title and artist', () => {
    const state = {
      isPlaying: true,
      title: 'My Song',
      artist: 'My Artist',
      album: 'My Album',
      duration: 180,
      currentTime: 60,
      albumArt: null,
    };
    const presence = buildPresence(state);
    expect(presence.details).toBe('My Song');
    expect(presence.state).toBe('My Artist');
    expect(presence.largeImageText).toBe('My Album');
  });

  it('omits artist when not provided', () => {
    const state = {
      isPlaying: true,
      title: 'My Song',
      artist: '',
      album: 'My Album',
      duration: 0,
      currentTime: 0,
      albumArt: null,
    };
    const presence = buildPresence(state);
    expect(presence.state).toBeUndefined();
  });

  it('includes endTimestamp when playing with duration', () => {
    const state = {
      isPlaying: true,
      title: 'My Song',
      artist: 'Artist',
      album: 'Album',
      duration: 180,
      currentTime: 60,
      albumArt: null,
    };
    const presence = buildPresence(state);
    expect(presence.endTimestamp).toBeInstanceOf(Date);
  });

  it('omits endTimestamp when paused', () => {
    const state = {
      isPlaying: false,
      title: 'My Song',
      artist: 'Artist',
      album: 'Album',
      duration: 180,
      currentTime: 60,
      albumArt: null,
    };
    const presence = buildPresence(state);
    expect(presence.endTimestamp).toBeUndefined();
  });

  it('omits endTimestamp when duration is 0', () => {
    const state = {
      isPlaying: true,
      title: 'My Song',
      artist: 'Artist',
      album: 'Album',
      duration: 0,
      currentTime: 0,
      albumArt: null,
    };
    const presence = buildPresence(state);
    expect(presence.endTimestamp).toBeUndefined();
  });
});
