import { ipcMain, BrowserWindow, net } from 'electron';
import { spawn } from 'child_process';
import { logger } from '../logger';
import { getYtDlpPath } from '../ytdlp-manager';

interface SearchResult {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
  webpage_url: string;
  view_count?: number;
}

interface SpotifyTrack {
  title: string;
  artist: string;
}

type PlaylistType = 'youtube' | 'spotify' | 'unknown';

let cancelledFlag = false;

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows[0] ?? null;
}

function detectPlaylistType(url: string): PlaylistType {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (
      host.includes('youtube.com') ||
      host.includes('youtu.be') ||
      host.includes('music.youtube.com')
    ) {
      return 'youtube';
    }

    if (host === 'open.spotify.com' && parsed.pathname.startsWith('/playlist/')) {
      return 'spotify';
    }
  } catch {
    // invalid URL
  }

  return 'unknown';
}

function extractSpotifyPlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/playlist\/([a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function spawnYtDlpForPlaylist(
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getYtDlpPath(), args, { env: { ...process.env } });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('error', (err) => {
      reject(err);
    });
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

function parseYtDlpJsonLines(stdout: string): SearchResult[] {
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        const data = JSON.parse(line);
        const result: SearchResult = {
          id: data.id ?? '',
          title: data.title ?? 'Unknown',
          uploader: data.uploader ?? data.channel ?? 'Unknown',
          duration: data.duration ?? 0,
          thumbnail: data.thumbnail ?? data.thumbnails?.[0]?.url ?? '',
          url: data.url ?? `https://www.youtube.com/watch?v=${data.id}`,
          webpage_url: data.webpage_url ?? `https://www.youtube.com/watch?v=${data.id}`,
          view_count: typeof data.view_count === 'number' ? data.view_count : undefined,
        };
        return result;
      } catch {
        return null;
      }
    })
    .filter((result): result is SearchResult => result !== null);
}

async function extractYouTubePlaylist(url: string): Promise<SearchResult[]> {
  logger.info(`[playlist] Extracting YouTube playlist: ${url}`);

  const { stdout, code } = await spawnYtDlpForPlaylist([
    '--flat-playlist',
    '--dump-json',
    '--no-warnings',
    url,
  ]);

  if (code !== 0) {
    throw new Error('yt-dlp failed to extract playlist');
  }

  const results = parseYtDlpJsonLines(stdout);
  logger.info(`[playlist] Extracted ${results.length} tracks from YouTube playlist`);
  return results;
}

async function fetchSpotifyEmbedTracks(playlistId: string): Promise<SpotifyTrack[]> {
  logger.info(`[playlist] Fetching Spotify embed page for playlist: ${playlistId}`);

  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const response = await net.fetch(embedUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify embed page: ${response.status}`);
  }

  const html = await response.text();

  // The embed page includes a <script id="__NEXT_DATA__"> or similar JSON blob
  // with track data. Try multiple extraction strategies.
  const tracks: SpotifyTrack[] = [];

  // Strategy 1: Look for the resource JSON in a <script> tag
  const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    try {
      const nextData = JSON.parse(scriptMatch[1]);
      const items =
        nextData?.props?.pageProps?.state?.data?.entity?.trackList ??
        nextData?.props?.pageProps?.state?.data?.entity?.tracks?.items ??
        [];

      for (const item of items) {
        const track = item.track ?? item;
        const title = track.name ?? track.title;
        const artist =
          track.artists?.map((a: { name: string }) => a.name).join(', ') ??
          track.artist ??
          'Unknown';
        if (title) {
          tracks.push({ title, artist });
        }
      }
    } catch {
      logger.warn('[playlist] Failed to parse __NEXT_DATA__ from Spotify embed');
    }
  }

  // Strategy 2: Look for JSON data embedded in other script tags
  if (tracks.length === 0) {
    const jsonMatches = html.matchAll(/"trackList"\s*:\s*(\[[\s\S]*?\])\s*[,}]/g);
    for (const match of jsonMatches) {
      try {
        const trackList = JSON.parse(match[1]);
        for (const item of trackList) {
          const title = item.title ?? item.name;
          const artist =
            item.subtitle ??
            item.artists?.map((a: { name: string }) => a.name).join(', ') ??
            'Unknown';
          if (title) {
            tracks.push({ title, artist });
          }
        }
      } catch {
        continue;
      }
    }
  }

  // Strategy 3: Look for any JSON with track-like structures
  if (tracks.length === 0) {
    const allScripts = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g);
    for (const scriptBlock of allScripts) {
      const content = scriptBlock[1];
      const trackPattern = /"title"\s*:\s*"([^"]+)"[\s\S]*?"artists"\s*:\s*\[([\s\S]*?)\]/g;
      let trackMatch;
      while ((trackMatch = trackPattern.exec(content)) !== null) {
        const title = trackMatch[1];
        const artistsStr = trackMatch[2];
        const artistNameMatch = artistsStr.match(/"name"\s*:\s*"([^"]+)"/);
        const artist = artistNameMatch?.[1] ?? 'Unknown';
        if (title) {
          tracks.push({ title, artist });
        }
      }
    }
  }

  logger.info(`[playlist] Extracted ${tracks.length} tracks from Spotify embed`);
  return tracks;
}

async function resolveSpotifyTrackOnYouTube(track: SpotifyTrack): Promise<SearchResult | null> {
  const query = `${track.artist} - ${track.title}`;
  logger.info(`[playlist] Searching YouTube for: ${query}`);

  try {
    const { stdout, code } = await spawnYtDlpForPlaylist([
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      `ytsearch1:${query}`,
    ]);

    if (code !== 0) return null;

    const results = parseYtDlpJsonLines(stdout);
    return results[0] ?? null;
  } catch {
    return null;
  }
}

async function extractSpotifyPlaylist(url: string): Promise<SearchResult[]> {
  const playlistId = extractSpotifyPlaylistId(url);
  if (!playlistId) {
    throw new Error('Invalid Spotify playlist URL');
  }

  const spotifyTracks = await fetchSpotifyEmbedTracks(playlistId);
  if (spotifyTracks.length === 0) {
    throw new Error(
      'Could not extract tracks from Spotify playlist. The playlist may be private or empty.'
    );
  }

  const mainWindow = getMainWindow();
  const results: SearchResult[] = [];
  const total = spotifyTracks.length;

  for (let i = 0; i < total; i++) {
    if (cancelledFlag) break;

    // Send extraction progress
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('playlist:extract-progress', {
        current: i + 1,
        total,
        trackName: `${spotifyTracks[i].artist} - ${spotifyTracks[i].title}`,
      });
    }

    const result = await resolveSpotifyTrackOnYouTube(spotifyTracks[i]);
    if (result) {
      results.push(result);
    }
  }

  logger.info(`[playlist] Resolved ${results.length}/${total} Spotify tracks on YouTube`);
  return results;
}

export function registerPlaylistHandlers(): void {
  ipcMain.handle('playlist:extract', async (_event, url: string) => {
    cancelledFlag = false;

    const playlistType = detectPlaylistType(url);

    if (playlistType === 'unknown') {
      throw new Error(
        'Unsupported URL. Please provide a YouTube or Spotify playlist URL.'
      );
    }

    try {
      if (playlistType === 'youtube') {
        return await extractYouTubePlaylist(url);
      }
      return await extractSpotifyPlaylist(url);
    } catch (err) {
      logger.error('[playlist] Extraction error:', err);
      throw err;
    }
  });

  ipcMain.handle('playlist:cancel', async () => {
    cancelledFlag = true;
    logger.info('[playlist] Extraction cancelled');
  });
}

export function cleanupPlaylistHandlers(): void {
  ipcMain.removeHandler('playlist:extract');
  ipcMain.removeHandler('playlist:cancel');
}
