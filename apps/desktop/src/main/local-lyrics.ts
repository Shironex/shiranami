import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger';
import { parseLrc, type LyricsResult } from './lyrics-service';

export type LocalLyricsResult = Omit<LyricsResult, 'source'> & {
  source: 'local-lrc' | 'local-txt';
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function stripBom(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

function normalizeNewlines(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

const HEADER_LINE_RE = /^([A-Za-z][A-Za-z ]{0,30}):\s*(.+)$/;

/**
 * Strip a leading "Key: Value" header block from plain text lyrics.
 * Stops at the first blank line or first non-Key:Value line.
 * If the whole file looks like header, returns the original content.
 */
export function stripLyricsHeader(content: string): string {
  const lines = content.split('\n');
  let i = 0;
  let consumed = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.length >= 120) break;
    if (!HEADER_LINE_RE.test(line)) break;
    consumed++;
    i++;
  }

  if (consumed === 0) return content;

  // If we consumed everything (no body), return original
  const hasBodyAhead = lines.slice(i).some((l) => l.trim().length > 0);
  if (!hasBodyAhead) return content;

  // Skip one blank separator line after the header block
  if (i < lines.length && lines[i].trim() === '') {
    i++;
  }

  return lines.slice(i).join('\n').replace(/\s+$/, '');
}

function buildCandidatePaths(audioFilePath: string): string[] {
  const dir = path.dirname(audioFilePath);
  const base = path.parse(audioFilePath).name;
  return [
    path.join(dir, `${base}.lrc`),
    path.join(dir, 'Lyrics', `${base}.lrc`),
    path.join(dir, 'lyrics', `${base}.lrc`),
    path.join(dir, `${base}.txt`),
    path.join(dir, 'Lyrics', `${base}.txt`),
    path.join(dir, 'lyrics', `${base}.txt`),
  ];
}

/**
 * Look for a sibling .lrc or .txt lyrics file next to the given audio file.
 * Returns null if none of the candidate paths exist.
 */
export async function loadLocalLyrics(
  audioFilePath: string
): Promise<LocalLyricsResult | null> {
  const candidates = buildCandidatePaths(audioFilePath);

  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) continue;

    try {
      const raw = await fs.readFile(candidate, 'utf-8');
      const content = normalizeNewlines(stripBom(raw));
      const ext = path.extname(candidate).toLowerCase();

      if (ext === '.lrc') {
        const synced = parseLrc(content);
        if (synced.length >= 1) {
          logger.debug(`[local-lyrics] Loaded synced lyrics: ${candidate}`);
          return { synced, plain: null, source: 'local-lrc' };
        }
        // Fallback: show raw text so something is visible
        logger.debug(
          `[local-lyrics] .lrc had no timestamps, using plain fallback: ${candidate}`
        );
        return { synced: null, plain: content, source: 'local-lrc' };
      }

      if (ext === '.txt') {
        const stripped = stripLyricsHeader(content);
        logger.debug(`[local-lyrics] Loaded plain lyrics: ${candidate}`);
        return { synced: null, plain: stripped, source: 'local-txt' };
      }
    } catch (error) {
      logger.debug(`[local-lyrics] Failed to read ${candidate}: ${String(error)}`);
      continue;
    }
  }

  return null;
}
