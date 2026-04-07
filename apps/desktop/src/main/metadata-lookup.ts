import { spawn } from 'child_process';
import { net } from 'electron';
import { requestJson } from './http';
import { getYtDlpPath, isYtDlpInstalled } from './ytdlp-manager';
import { logger } from './logger';

/**
 * Clean a title for search: strip parenthetical noise like (Official Video),
 * (Lyrics), (Visualizer), etc. and remove artist prefix if already embedded.
 */
export function cleanTitleForSearch(title: string, artist: string): string {
  let cleaned = title;

  // If the title starts with "Artist - ...", strip the artist prefix
  if (artist && artist !== 'Unknown Artist') {
    const lower = cleaned.toLowerCase();
    const artistLower = artist.toLowerCase();
    if (lower.startsWith(`${artistLower} - `)) {
      cleaned = cleaned.slice(artist.length + 3);
    } else if (lower.startsWith(`${artistLower} – `)) {
      cleaned = cleaned.slice(artist.length + 3);
    }
  }

  // Strip common YouTube/video noise
  cleaned = cleaned
    // Parenthetical noise: (Official Video), (Lyrics), (Prod. xyz), (feat. xyz) kept
    .replace(/\s*\((?:Official\s*(?:Video|Audio|Lyric\s*Video|Visualizer|Music\s*Video)|Lyrics?|MV|Audio|Visualizer|AMV|Prod\.?\s*[^)]*|MOURN\s*\d*|Male\s*Version|Female\s*Version|Rock\s*(?:Version|Cover)|Cover|Remix|Extended|80s\s*Remix)\)/gi, '')
    // Square bracket noise: [Official Audio], [Looped], [+Lyrics], [male], [NMV], [Wave], etc.
    .replace(/\s*\[[^\]]*\]/g, '')
    // CJK brackets: 「...」【...】
    .replace(/[「」『』]/g, '')
    .replace(/【[^】]*】/g, '')
    // Pipe-separated suffixes: | ENGLISH ver | AmaLee
    .replace(/\s*[|｜]\s*.*/g, '')
    // Underscores → spaces
    .replace(/\s*_\s*/g, ' ')
    // "Nightcore - Song Name" → "Song Name" (the original song is what we want)
    .replace(/^Nightcore\s*[-–]\s*/i, '')
    // Strip "ft." / "feat." trailing credits for cleaner search
    .replace(/\s*(?:ft\.?|feat\.?)\s+.+$/i, '')
    .trim();

  return cleaned || title;
}

export interface MetadataLookupResult {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
  trackNumber?: number;
  coverImageUrl?: string;
  source: 'itunes' | 'youtube' | 'none';
  confidence: number; // 0-1 how confident the match is
}

interface ITunesResult {
  resultCount: number;
  results: Array<{
    trackName?: string;
    artistName?: string;
    collectionName?: string;
    primaryGenreName?: string;
    releaseDate?: string;
    trackNumber?: number;
    artworkUrl100?: string;
  }>;
}

/**
 * Search iTunes for track metadata.
 * Returns the best match or null if nothing found.
 */
async function searchItunes(
  title: string,
  artist: string
): Promise<MetadataLookupResult | null> {
  try {
    // Build search query: clean title and combine with artist
    const cleanedTitle = cleanTitleForSearch(title, artist);
    const query = artist && artist !== 'Unknown Artist'
      ? `${artist} ${cleanedTitle}`
      : cleanedTitle;

    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`;
    logger.info(`[metadata-lookup] iTunes search: "${query}"`);
    const data = await requestJson<ITunesResult>(url);

    if (!data.results || data.results.length === 0) {
      logger.info(`[metadata-lookup] iTunes: no results for "${query}"`);
      return null;
    }

    // Try to find the best match by comparing title similarity
    const normalizedTitle = title.toLowerCase().trim();
    const normalizedArtist = artist.toLowerCase().trim();

    let bestMatch = data.results[0];
    let bestScore = 0;

    for (const result of data.results) {
      let score = 0;
      const resultTitle = (result.trackName || '').toLowerCase().trim();
      const resultArtist = (result.artistName || '').toLowerCase().trim();

      // Title match
      if (resultTitle === normalizedTitle) {
        score += 0.5;
      } else if (resultTitle.includes(normalizedTitle) || normalizedTitle.includes(resultTitle)) {
        score += 0.3;
      }

      // Artist match
      if (normalizedArtist !== 'unknown artist') {
        if (resultArtist === normalizedArtist) {
          score += 0.5;
        } else if (resultArtist.includes(normalizedArtist) || normalizedArtist.includes(resultArtist)) {
          score += 0.3;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
      }
    }

    // Replace artwork size: 100x100 -> 600x600
    const artworkUrl = bestMatch.artworkUrl100
      ? bestMatch.artworkUrl100.replace('100x100bb', '600x600bb')
      : undefined;

    const releaseDate = bestMatch.releaseDate ? new Date(bestMatch.releaseDate) : null;
    const releaseYear = releaseDate && !isNaN(releaseDate.getTime())
      ? releaseDate.getFullYear()
      : undefined;

    logger.info(`[metadata-lookup] iTunes match: "${bestMatch.trackName}" by "${bestMatch.artistName}" (score: ${bestScore.toFixed(2)}, album: "${bestMatch.collectionName}")`);

    return {
      title: bestMatch.trackName || undefined,
      artist: bestMatch.artistName || undefined,
      album: bestMatch.collectionName || undefined,
      genre: bestMatch.primaryGenreName || undefined,
      year: releaseYear,
      trackNumber: bestMatch.trackNumber || undefined,
      coverImageUrl: artworkUrl,
      source: 'itunes',
      confidence: bestScore,
    };
  } catch (error) {
    logger.warn('[metadata-lookup] iTunes search failed:', error);
    return null;
  }
}

/**
 * Search YouTube via yt-dlp for a thumbnail.
 * Fallback when iTunes doesn't return results.
 */
async function searchYouTube(
  title: string,
  artist: string
): Promise<MetadataLookupResult | null> {
  if (!isYtDlpInstalled()) {
    logger.info('[metadata-lookup] YouTube: yt-dlp not installed, skipping');
    return null;
  }

  try {
    const cleanedTitle = cleanTitleForSearch(title, artist);
    const query = artist && artist !== 'Unknown Artist'
      ? `${artist} - ${cleanedTitle}`
      : cleanedTitle;
    logger.info(`[metadata-lookup] YouTube search: "${query}"`);

    const { stdout, code } = await spawnYtDlp([
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      `ytsearch1:${query}`,
    ]);

    if (code !== 0 || !stdout.trim()) {
      logger.info(`[metadata-lookup] YouTube: no results (code: ${code})`);
      return null;
    }

    const data = JSON.parse(stdout.trim().split('\n')[0]);
    const thumbnailUrl = data.thumbnail
      || data.thumbnails?.[data.thumbnails.length - 1]?.url
      || (data.id ? `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg` : undefined);

    return {
      coverImageUrl: thumbnailUrl,
      source: 'youtube',
      confidence: 0.3, // YouTube matches are less reliable for metadata
    };
  } catch (error) {
    logger.warn('[metadata-lookup] YouTube search failed:', error);
    return null;
  }
}

function spawnYtDlp(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
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

const IMAGE_TIMEOUT_MS = 30_000;
const IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Download an image from a URL and return it as a Buffer.
 */
export function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = net.request(url);

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        request.abort();
        reject(new Error(`Image download timed out after ${IMAGE_TIMEOUT_MS}ms`));
      }
    }, IMAGE_TIMEOUT_MS);

    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        clearTimeout(timer);
        settled = true;
        reject(new Error(`Image download failed with status ${response.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;

      response.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > IMAGE_MAX_SIZE) {
          clearTimeout(timer);
          settled = true;
          request.abort();
          reject(new Error(`Image exceeds maximum size of ${IMAGE_MAX_SIZE} bytes`));
          return;
        }
        chunks.push(chunk);
      });

      response.on('end', () => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          resolve(Buffer.concat(chunks));
        }
      });

      response.on('error', (err) => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          reject(err);
        }
      });
    });

    request.on('error', (err) => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        reject(err);
      }
    });

    request.end();
  });
}

/**
 * Look up metadata for a track. Tries iTunes first, falls back to YouTube for thumbnails.
 */
export async function lookupMetadata(
  title: string,
  artist: string
): Promise<MetadataLookupResult> {
  // Non-artist keywords that appear before a dash in titles but aren't real artists
  const NON_ARTIST_PREFIXES = /^(nightcore|amv|mv|lyrics?|official|hd|hq|full|extended|remix|cover|male|female)\b/i;

  // If the title contains "Artist - Song" pattern, extract a better artist/title split
  // This handles YouTube downloads where artist = channel name, title = "RealArtist - Song Name"
  let searchTitle = title;
  let searchArtist = artist;
  const dashMatch = title.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (dashMatch && (artist === 'Unknown Artist' || !title.toLowerCase().startsWith(artist.toLowerCase()))) {
    const candidateArtist = dashMatch[1].trim();
    const candidateTitle = dashMatch[2].trim();

    if (NON_ARTIST_PREFIXES.test(candidateArtist)) {
      // "Nightcore - Darkside" → just use "Darkside" as title, keep original artist as Unknown
      searchTitle = candidateTitle;
      searchArtist = 'Unknown Artist';
      logger.info(`[metadata-lookup] Stripped non-artist prefix "${candidateArtist}", title: "${searchTitle}"`);
    } else {
      searchArtist = candidateArtist;
      searchTitle = candidateTitle;
      logger.info(`[metadata-lookup] Extracted artist/title from title: "${searchArtist}" - "${searchTitle}"`);
    }
  }

  logger.info(`[metadata-lookup] Looking up: "${searchTitle}" by "${searchArtist}"`);

  // Try iTunes first (structured metadata + album art)
  const itunesResult = await searchItunes(searchTitle, searchArtist);
  if (itunesResult && itunesResult.confidence >= 0.3) {
    logger.info(`[metadata-lookup] Using iTunes result (confidence: ${itunesResult.confidence.toFixed(2)})`);
    return itunesResult;
  }

  // Fall back to YouTube for at least a thumbnail
  const youtubeResult = await searchYouTube(searchTitle, searchArtist);
  if (youtubeResult) {
    // Merge: if iTunes had some low-confidence data, use it for text fields
    if (itunesResult) {
      return {
        ...itunesResult,
        coverImageUrl: youtubeResult.coverImageUrl || itunesResult.coverImageUrl,
        source: youtubeResult.coverImageUrl ? 'youtube' : 'itunes',
        confidence: Math.max(itunesResult.confidence, youtubeResult.confidence),
      };
    }
    return youtubeResult;
  }

  // Return iTunes result even with low confidence, or empty
  if (!itunesResult) {
    logger.info(`[metadata-lookup] No results found for "${searchTitle}" by "${searchArtist}"`);
  }
  return itunesResult || { source: 'none', confidence: 0 };
}
