import { useCallback, useEffect, useRef, useState } from 'react';

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

export function useLyrics(title?: string, artist?: string, album?: string, duration?: number) {
  const [lyrics, setLyrics] = useState<LyricsResult>({ synced: null, plain: null });
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!title || !artist) {
      setLyrics({ synced: null, plain: null });
      return;
    }

    const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached) {
      setLyrics(cached);
      return;
    }

    const reqId = ++requestRef.current;
    setLoading(true);

    fetchFromLrclib(title, artist, album, duration)
      .then(result => {
        if (reqId !== requestRef.current) return;
        cache.set(key, result);
        setLyrics(result);
      })
      .catch(() => {
        if (reqId !== requestRef.current) return;
        setLyrics({ synced: null, plain: null });
      })
      .finally(() => {
        if (reqId === requestRef.current) setLoading(false);
      });
  }, [title, artist, album, duration]);

  const getActiveLine = useCallback(
    (currentTime: number): number => {
      if (!lyrics.synced) return -1;
      for (let i = lyrics.synced.length - 1; i >= 0; i--) {
        if (currentTime >= lyrics.synced[i].time) return i;
      }
      return -1;
    },
    [lyrics.synced]
  );

  return { lyrics, loading, getActiveLine };
}
