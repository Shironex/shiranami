import type { LyricLine, LyricsResult } from '@shiranami/contracts';

export type { LyricLine, LyricsResult, LyricsSource } from '@shiranami/contracts';

/**
 * Parse LRC format string into array of timed lyric lines.
 * Format: [mm:ss.xx]Lyric text
 * A line may carry multiple timestamps ([mm:ss.xx][mm:ss.xx]Text) for
 * repeated lyrics, and the millisecond separator may be `.` or `:`.
 */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const lineRegex = /^\s*((?:\[\d{1,2}:\d{2}[.:]\d{2,3}\])+)\s*(.*)/;
  const timestampRegex = /\[(\d{1,2}):(\d{2})[.:](\d{2,3})\]/g;

  for (const rawLine of lrc.split('\n')) {
    const match = rawLine.match(lineRegex);
    if (!match) continue;
    const text = match[2].trim();
    if (!text) continue;
    for (const stamp of match[1].matchAll(timestampRegex)) {
      const minutes = parseInt(stamp[1], 10);
      const seconds = parseInt(stamp[2], 10);
      const ms = stamp[3].length === 2 ? parseInt(stamp[3], 10) * 10 : parseInt(stamp[3], 10);
      const time = minutes * 60 + seconds + ms / 1000;
      lines.push({ time, text });
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
