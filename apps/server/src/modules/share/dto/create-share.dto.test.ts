import { describe, it, expect } from 'vitest';
import { createShareSchema, createTrackShareSchema, createPlaylistShareSchema } from './create-share.dto';

const validTrack = { title: 'Song', artist: 'Artist', ytId: 'dQw4w9WgXcQ' };

describe('createTrackShareSchema', () => {
  it('accepts a valid track share payload', () => {
    const input = { type: 'TRACK' as const, payload: validTrack };
    expect(createTrackShareSchema.parse(input)).toEqual(input);
  });

  it('rejects missing title', () => {
    const result = createTrackShareSchema.safeParse({
      type: 'TRACK',
      payload: { artist: 'Artist', ytId: 'abc' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing artist', () => {
    const result = createTrackShareSchema.safeParse({
      type: 'TRACK',
      payload: { title: 'Song', ytId: 'abc' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing ytId', () => {
    const result = createTrackShareSchema.safeParse({
      type: 'TRACK',
      payload: { title: 'Song', artist: 'Artist' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty string fields', () => {
    const result = createTrackShareSchema.safeParse({
      type: 'TRACK',
      payload: { title: '', artist: 'Artist', ytId: 'abc' },
    });
    expect(result.success).toBe(false);
  });

  it('enforces title max length of 500', () => {
    const result = createTrackShareSchema.safeParse({
      type: 'TRACK',
      payload: { title: 'a'.repeat(501), artist: 'Artist', ytId: 'abc' },
    });
    expect(result.success).toBe(false);
  });

  it('enforces artist max length of 500', () => {
    const result = createTrackShareSchema.safeParse({
      type: 'TRACK',
      payload: { title: 'Song', artist: 'a'.repeat(501), ytId: 'abc' },
    });
    expect(result.success).toBe(false);
  });

  it('enforces ytId max length of 20', () => {
    const result = createTrackShareSchema.safeParse({
      type: 'TRACK',
      payload: { title: 'Song', artist: 'Artist', ytId: 'a'.repeat(21) },
    });
    expect(result.success).toBe(false);
  });
});

describe('createPlaylistShareSchema', () => {
  it('accepts a valid playlist share payload', () => {
    const input = {
      type: 'PLAYLIST' as const,
      payload: { name: 'My Playlist', tracks: [validTrack] },
    };
    expect(createPlaylistShareSchema.parse(input)).toEqual(input);
  });

  it('rejects empty tracks array', () => {
    const result = createPlaylistShareSchema.safeParse({
      type: 'PLAYLIST',
      payload: { name: 'My Playlist', tracks: [] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = createPlaylistShareSchema.safeParse({
      type: 'PLAYLIST',
      payload: { tracks: [validTrack] },
    });
    expect(result.success).toBe(false);
  });

  it('enforces playlist name max length of 200', () => {
    const result = createPlaylistShareSchema.safeParse({
      type: 'PLAYLIST',
      payload: { name: 'a'.repeat(201), tracks: [validTrack] },
    });
    expect(result.success).toBe(false);
  });

  it('enforces max 500 tracks', () => {
    const tracks = Array.from({ length: 501 }, () => validTrack);
    const result = createPlaylistShareSchema.safeParse({
      type: 'PLAYLIST',
      payload: { name: 'Big List', tracks },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid track inside playlist', () => {
    const result = createPlaylistShareSchema.safeParse({
      type: 'PLAYLIST',
      payload: { name: 'List', tracks: [{ title: 'Song' }] },
    });
    expect(result.success).toBe(false);
  });
});

describe('createShareSchema (discriminated union)', () => {
  it('accepts a valid TRACK share', () => {
    const result = createShareSchema.safeParse({
      type: 'TRACK',
      payload: validTrack,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid PLAYLIST share', () => {
    const result = createShareSchema.safeParse({
      type: 'PLAYLIST',
      payload: { name: 'Playlist', tracks: [validTrack] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid type discriminator', () => {
    const result = createShareSchema.safeParse({
      type: 'ALBUM',
      payload: validTrack,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing type field', () => {
    const result = createShareSchema.safeParse({
      payload: validTrack,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing payload field', () => {
    const result = createShareSchema.safeParse({
      type: 'TRACK',
    });
    expect(result.success).toBe(false);
  });
});
