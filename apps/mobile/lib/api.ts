import { env, normalizeHttpUrl } from './env';
import type { SearchResult } from './types';

let baseUrl = env.apiUrl;
let apiKey = env.apiKey;

/** How long a server call may take before it counts as unreachable. */
const REQUEST_TIMEOUT_MS = 30_000;

export function configureApi(url: string, key?: string) {
  baseUrl = url.replace(/\/+$/, '');
  if (key) apiKey = key;
}

/**
 * Points the client at a server URL typed in Settings or read from storage.
 * An invalid value (no http(s) scheme) is ignored, so the client keeps the
 * last valid URL. Returns whether the URL was applied.
 */
export function applyServerUrl(value: string): boolean {
  const url = normalizeHttpUrl(value);
  if (!url) return false;
  configureApi(url);
  return true;
}

/**
 * Why a server call failed, in words the Search tab can explain:
 * - `no_key`: this build has no API key, so nothing is sent.
 * - `unauthorized`: the server turned the key down (401).
 * - `unreachable`: no answer at all (offline, wrong address, timeout).
 * - `disabled`: the server answered but has no YouTube routes.
 * - `unavailable`: the video cannot be played (removed, private, live).
 * - `rate_limited`: too many requests (429).
 * - `server`: anything else the server got wrong.
 */
export type ApiErrorKind =
  | 'no_key'
  | 'unauthorized'
  | 'unreachable'
  | 'disabled'
  | 'unavailable'
  | 'rate_limited'
  | 'server';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string = kind,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Maps a non-2xx answer to an ApiError. Nest answers `{ message }`. */
export function errorFromStatus(status: number, body: string): ApiError {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === 'string') message = parsed.message;
  } catch {
    // Not JSON: keep the text.
  }
  if (status === 401 || status === 403) return new ApiError('unauthorized', message, status);
  if (status === 429) return new ApiError('rate_limited', message, status);
  // Nest's own 404 for a route that is not mounted reads "Cannot GET /...".
  if (status === 404) {
    return new ApiError(
      message.startsWith('Cannot ') ? 'disabled' : 'unavailable',
      message,
      status
    );
  }
  return new ApiError('server', message, status);
}

/** The current server address joined with a server-relative path. */
export function serverUrl(path: string): string {
  return `${baseUrl}${path}`;
}

/** Headers every YouTube call sends. Throws `no_key` when the build has none. */
export function authHeaders(): Record<string, string> {
  if (!apiKey) throw new ApiError('no_key');
  return { 'x-shiranami-key': apiKey };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...authHeaders() };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(serverUrl(path), {
      ...init,
      headers: { ...headers, ...init?.headers },
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiError('unreachable', error instanceof Error ? error.message : 'unreachable');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw errorFromStatus(res.status, text);
  }

  return res.json();
}

export async function searchYouTube(query: string): Promise<SearchResult[]> {
  return request(`/api/youtube/search?q=${encodeURIComponent(query)}`);
}

export async function suggestYouTube(query: string): Promise<string[]> {
  return request(`/api/youtube/suggest?q=${encodeURIComponent(query)}`);
}

/** Where a video's audio can be fetched, through the server. */
export interface AudioLink {
  /** Absolute URL of the server's audio route, signed for this video. */
  url: string;
  /** Unix seconds after which the link stops working. */
  expiresAt: number;
  /** File extension of the format the server streams, such as `m4a`. */
  ext: string;
  /** Whole file size in bytes. */
  size: number;
}

/**
 * Asks the server for a signed link to a video's audio. The server checks
 * the video can be played first, so a removed video fails here, not in the
 * player. The link needs no header, so the player and downloader can use it.
 */
export async function getAudioLink(videoId: string): Promise<AudioLink> {
  const data = await request<{ path: string; expiresAt: number; ext: string; size: number }>(
    `/api/youtube/stream/${encodeURIComponent(videoId)}`
  );
  return { url: serverUrl(data.path), expiresAt: data.expiresAt, ext: data.ext, size: data.size };
}

export async function extractPlaylist(url: string): Promise<SearchResult[]> {
  return request('/api/youtube/playlist', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}
