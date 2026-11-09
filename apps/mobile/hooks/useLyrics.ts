import { useCallback, useEffect, useRef, useState } from 'react';
import { activeLyricIndex } from '@/lib/lyrics-sync';

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsResult {
  synced: LyricLine[] | null;
  plain: string | null;
}

const LRCLIB_BASE = 'https://lrclib.net/api';
const cache = new Map<string, LyricsResult>();

function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/;

  for (const rawLine of lrc.split('\n')) {
    const match = rawLine.match(regex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
      const time = minutes * 60 + seconds + ms / 1000;
      const text = match[4].trim();
      if (text) lines.push({ time, text });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

async function fetchFromLrclib(
  title: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<LyricsResult> {
  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist,
  });
  if (album && album !== 'Unknown Album') params.set('album_name', album);
  if (duration && duration > 0) params.set('duration', String(Math.round(duration)));

  const res = await fetch(`${LRCLIB_BASE}/get?${params}`);
  if (!res.ok) {
    // Try search fallback
    const searchRes = await fetch(
      `${LRCLIB_BASE}/search?q=${encodeURIComponent(`${title} ${artist}`)}`
    );
    if (!searchRes.ok) return { synced: null, plain: null };
    const results = (await searchRes.json()) as Array<{
      syncedLyrics?: string;
      plainLyrics?: string;
    }>;
    if (!results.length) return { synced: null, plain: null };
    const best = results[0];
    return {
      synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : null,
      plain: best.plainLyrics ?? null,
    };
  }

  const data = (await res.json()) as { syncedLyrics?: string; plainLyrics?: string };
  return {
    synced: data.syncedLyrics ? parseLrc(data.syncedLyrics) : null,
    plain: data.plainLyrics ?? null,
  };
}

function cacheKey(title?: string, artist?: string): string | null {
  return title && artist ? `${title.toLowerCase()}::${artist.toLowerCase()}` : null;
}

const NO_LYRICS: LyricsResult = { synced: null, plain: null };

interface Loaded {
  /** The song these lyrics belong to (its cache key), or null for none. */
  key: string | null;
  lyrics: LyricsResult;
}

export function useLyrics(title?: string, artist?: string, album?: string, duration?: number) {
  const key = cacheKey(title, artist);
  // The result is tagged with its song, so a render for a new song never
  // shows, highlights or seeks with the lines of the song before, and an
  // uncached song counts as loading from its first render.
  const [loaded, setLoaded] = useState<Loaded>({ key: null, lyrics: NO_LYRICS });
  const requestRef = useRef(0);

  useEffect(() => {
    // Drop any request still out for the song before.
    const reqId = ++requestRef.current;
    if (!key || !title || !artist) return;
    if (cache.has(key)) return;

    fetchFromLrclib(title, artist, album, duration)
      .then(result => {
        cache.set(key, result);
        return result;
      })
      .catch(() => NO_LYRICS)
      .then(result => {
        if (reqId === requestRef.current) setLoaded({ key, lyrics: result });
      });
  }, [key, title, artist, album, duration]);

  const cached = key ? cache.get(key) : undefined;
  const current = loaded.key === key;
  // A cached song is known at once; an uncached one waits for its own result.
  const lyrics = !key ? NO_LYRICS : (cached ?? (current ? loaded.lyrics : NO_LYRICS));
  const loading = !!key && !cached && !current;

  const getActiveLine = useCallback(
    (currentTime: number): number => activeLyricIndex(lyrics.synced, currentTime),
    [lyrics.synced]
  );

  return { lyrics, loading, getActiveLine };
}
