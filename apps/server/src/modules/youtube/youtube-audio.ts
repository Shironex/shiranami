import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Helpers for the audio route, which streams YouTube audio through the server
 * so the phone never fetches a googlevideo URL itself. Those URLs carry the
 * resolving machine's IP in their signed parameters, and the phone's player
 * cannot send the API key header, so the route takes a short lived signed
 * token in the query instead of the key itself.
 */

/** How long a token from `stream/:videoId` keeps working, in seconds. */
export const AUDIO_TOKEN_TTL_SECONDS = 24 * 60 * 60;

/** Upstream bytes are fetched in pieces this big: googlevideo slows down or refuses bigger ranges. */
export const UPSTREAM_CHUNK_BYTES = 8 * 1024 * 1024;

function mac(key: string, videoId: string, expiresAt: number): Buffer {
  return createHmac('sha256', key).update(`audio:${videoId}:${expiresAt}`).digest();
}

/** `<expiresAt>.<base64url hmac>`, bound to one video and the server's API key. */
export function signAudioToken(key: string, videoId: string, expiresAt: number): string {
  return `${expiresAt}.${mac(key, videoId, expiresAt).toString('base64url')}`;
}

/** Whether `token` was signed with `key` for `videoId` and has not expired. */
export function verifyAudioToken(
  key: string,
  videoId: string,
  token: string,
  nowSeconds: number
): boolean {
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= nowSeconds) return false;
  const given = Buffer.from(match[2], 'base64url');
  const expected = mac(key, videoId, expiresAt);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface ByteRange {
  start: number;
  /** Inclusive. */
  end: number;
}

/**
 * Reads a `Range` header against a body of `total` bytes. Returns null when
 * the whole body should be sent (no header, or one this route ignores, such
 * as several ranges), and 'unsatisfiable' for a range past the end.
 */
export function parseRange(
  header: string | undefined,
  total: number
): ByteRange | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match) return null;
  const [, from, to] = match;
  if (!from && !to) return null;
  if (!from) {
    // Suffix range: the last N bytes.
    const length = Number(to);
    if (length === 0) return 'unsatisfiable';
    return { start: Math.max(0, total - length), end: total - 1 };
  }
  const start = Number(from);
  if (start >= total) return 'unsatisfiable';
  const end = to ? Math.min(Number(to), total - 1) : total - 1;
  if (end < start) return null;
  return { start, end };
}

/** The pieces of [start, end] to request upstream, in order. */
export function chunkRanges(range: ByteRange, chunkBytes = UPSTREAM_CHUNK_BYTES): ByteRange[] {
  const pieces: ByteRange[] = [];
  for (let start = range.start; start <= range.end; start += chunkBytes) {
    pieces.push({ start, end: Math.min(start + chunkBytes - 1, range.end) });
  }
  return pieces;
}

/** The `clen` (content length) a googlevideo URL carries, or null. */
export function contentLengthFromUrl(url: string): number | null {
  try {
    const value = Number(new URL(url).searchParams.get('clen'));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** The `expire` (unix seconds) a googlevideo URL carries, or null. */
export function expiryFromUrl(url: string): number | null {
  try {
    const value = Number(new URL(url).searchParams.get('expire'));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** The Content-Type for a yt-dlp extension. */
export function audioMimeType(ext: string): string {
  switch (ext) {
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'webm':
      return 'audio/webm';
    case 'mp3':
      return 'audio/mpeg';
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    default:
      return 'application/octet-stream';
  }
}
