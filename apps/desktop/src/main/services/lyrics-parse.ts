import type { LyricLine, LyricsResult } from '@shiranami/contracts';

export type { LyricLine, LyricsResult, LyricsSource } from '@shiranami/contracts';

/**
 * Parse LRC format string into array of timed lyric lines.
 * Format: [mm:ss.xx]Lyric text
 */
export function parseLrc(lrc: string): LyricLine[] {
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
      if (text) {
        lines.push({ time, text });
      }
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

export function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export function normalizeNewlines(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

export function hasSyncedLyrics(
  result: LyricsResult | null
): result is LyricsResult & { synced: LyricLine[] } {
  return !!result && Array.isArray(result.synced) && result.synced.length > 0;
}

export function hasPlainLyrics(
  result: LyricsResult | null
): result is LyricsResult & { plain: string } {
  return !!result && typeof result.plain === 'string' && result.plain.length > 0;
}
