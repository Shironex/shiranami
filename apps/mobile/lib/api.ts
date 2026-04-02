import type { SearchResult } from './types';

let baseUrl = 'https://api.shiranami.app';
let apiKey = '';

export function configureApi(url: string, key?: string) {
  baseUrl = url.replace(/\/$/, '');
  if (key) apiKey = key;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'x-shiranami-key': apiKey } : {}),
  };

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...headers, ...init?.headers },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json();
}

export async function searchYouTube(query: string): Promise<SearchResult[]> {
  return request(`/api/youtube/search?q=${encodeURIComponent(query)}`);
}

export async function suggestYouTube(query: string): Promise<string[]> {
  return request(`/api/youtube/suggest?q=${encodeURIComponent(query)}`);
}

export async function getStreamUrl(videoId: string): Promise<string> {
  const data = await request<{ url: string }>(`/api/youtube/stream/${videoId}`);
  return data.url;
}

export async function extractPlaylist(url: string): Promise<SearchResult[]> {
  return request('/api/youtube/playlist', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}
