import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '../app/logger';
import { parseLrc, stripBom, normalizeNewlines, type LyricsResult } from './lyrics-parse';

export type LocalLyricsResult = Omit<LyricsResult, 'source'> & {
  source: 'local-lrc' | 'local-txt';
};

// Whitelist of known metadata keys so we don't strip dialogue/duet lines
// like "He: Hello" or "She: Hi" that often appear at the top of lyrics.
const HEADER_LINE_RE =
  /^(Artist|Title|Album|Author|Lyrics|By|Offset|Composer|Year|Writer|Track):\s*(.+)$/i;

// A "Key: value" line longer than this is body content, not metadata.
const MAX_HEADER_LINE_LENGTH = 120;

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
    if (line.length >= MAX_HEADER_LINE_LENGTH) break;
    if (!HEADER_LINE_RE.test(line)) break;
    consumed++;
    i++;
  }

  if (consumed === 0) return content;

  // If we consumed everything (no body), return original
  const hasBodyAhead = lines.slice(i).some(l => l.trim().length > 0);
  if (!hasBodyAhead) return content;

  // Skip one blank separator line after the header block
  if (i < lines.length && lines[i].trim() === '') {
    i++;
  }

  return lines.slice(i).join('\n').replace(/\s+$/, '');
}

/**
 * Candidate lyric-file locations for an audio file, in precedence order:
 * sibling .lrc, .lrc inside a Lyrics/ (or lyrics/) subfolder, then the same
 * three locations for .txt. Filenames must match the audio file's basename.
 */
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
 * Look for a .lrc or .txt lyrics file next to the given audio file (or in a
 * Lyrics/ subfolder). Returns null if none of the candidate paths exist.
 */
export async function loadLocalLyrics(audioFilePath: string): Promise<LocalLyricsResult | null> {
  const candidates = buildCandidatePaths(audioFilePath);
  // Raw content of the first timestampless .lrc we hit, kept as a last resort
  // so a later candidate (a synced .lrc or a .txt) can still win.
  let lrcPlainFallback: string | null = null;

  for (const candidate of candidates) {
    let raw: string;
    try {
      raw = await fs.readFile(candidate, 'utf-8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        // The file exists but couldn't be read (EACCES, EISDIR, …) — exactly
        // the "my lyrics file isn't detected" support case, so log loudly.
        logger.warn(`[local-lyrics] Failed to read ${candidate}`, error);
      }
      continue;
    }

    const content = normalizeNewlines(stripBom(raw));
    const ext = path.extname(candidate).toLowerCase();

    if (ext === '.lrc') {
      const synced = parseLrc(content);
      if (synced.length >= 1) {
        logger.debug(`[local-lyrics] Loaded synced lyrics: ${candidate}`);
        return { synced, plain: null, source: 'local-lrc' };
      }
      // No timestamps: remember the raw text as a last resort, but keep
      // looking — another candidate may have proper timestamps or be a .txt.
      if (lrcPlainFallback === null) {
        logger.debug(`[local-lyrics] .lrc had no timestamps, keeping as fallback: ${candidate}`);
        lrcPlainFallback = content;
      }
      continue;
    }

    const stripped = stripLyricsHeader(content);
    logger.debug(`[local-lyrics] Loaded plain lyrics: ${candidate}`);
    return { synced: null, plain: stripped, source: 'local-txt' };
  }

  if (lrcPlainFallback !== null) {
    // Nothing better turned up; show the timestampless .lrc as plain text.
    logger.debug('[local-lyrics] Using timestampless .lrc as plain fallback');
    return { synced: null, plain: lrcPlainFallback, source: 'local-lrc' };
  }

  logger.debug('[local-lyrics] No lyric file found, checked:', candidates);
  return null;
}
